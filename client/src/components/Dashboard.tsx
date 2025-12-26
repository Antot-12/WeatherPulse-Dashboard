import { DndContext, PointerSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import type { DragCancelEvent, DragEndEvent, DragStartEvent, UniqueIdentifier } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable";
import Grid from "@mui/material/Grid";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

type GridBreakpoint = "xs" | "sm" | "md" | "lg" | "xl";
type GridSizeValue = number | "auto";
type GridSize = Partial<Record<GridBreakpoint, GridSizeValue>>;

const DEFAULT_SIZE: GridSize = { xs: 12, sm: 12, md: 6, lg: 4, xl: 3 };

const SIZES: Record<string, GridSize> = {
    overview: { xs: 12, sm: 12, md: 4, lg: 4, xl: 3 },
    forecast: { xs: 12, sm: 12, md: 8, lg: 8, xl: 9 },
    monitoring: { xs: 12, sm: 12, md: 12, lg: 12, xl: 12 },
};

type DashboardProps = {
    order: string[];
    onOrderChange: (next: string[]) => void;
    render: (id: string) => ReactNode;

    gap?: { xs?: number; sm?: number; md?: number; lg?: number; xl?: number } | number;

    getSize?: (id: string) => GridSize | undefined;

    isReorderDisabled?: boolean;
    isItemDraggable?: (id: string) => boolean;
    droppableIds?: string[];

    onDragStart?: (e: DragStartEvent) => void;
    onDragEnd?: (e: DragEndEvent) => void;
    onDragCancel?: (e: DragCancelEvent) => void;

    onActiveChange?: (activeId: string | null) => void;

    renderWrapper?: (args: { id: string; active: boolean; children: ReactNode }) => ReactNode;
};

function asStringId(id: UniqueIdentifier): string {
    return typeof id === "string" ? id : String(id);
}

function normalizeSpacing(
    gap: DashboardProps["gap"]
): { xs?: number; sm?: number; md?: number; lg?: number; xl?: number } {
    if (typeof gap === "number") return { xs: gap, sm: gap };
    return gap ?? { xs: 1.5, sm: 2 };
}

export function Dashboard({
                              order,
                              onOrderChange,
                              render,
                              gap,
                              getSize,
                              isReorderDisabled,
                              isItemDraggable,
                              droppableIds,
                              onDragStart,
                              onDragEnd,
                              onDragCancel,
                              onActiveChange,
                              renderWrapper,
                          }: DashboardProps) {
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
    const [activeId, setActiveId] = useState<string | null>(null);

    const spacing = useMemo(() => normalizeSpacing(gap), [gap]);

    const allowedSet = useMemo(() => {
        const ids = droppableIds?.length ? droppableIds : order;
        return new Set(ids);
    }, [droppableIds, order]);

    const items = useMemo(() => order, [order]);

    const getItemSize = (id: string) => {
        const custom = getSize?.(id);
        if (custom) return custom;
        return SIZES[id] ?? DEFAULT_SIZE;
    };

    const wrap = (id: string, child: ReactNode) => {
        const node = (
            <Grid
                key={id}
                size={getItemSize(id)}
                sx={{
                    minWidth: 0,
                    filter: activeId && activeId !== id ? "saturate(0.9) opacity(0.92)" : "none",
                    transition: "filter 140ms ease, transform 140ms ease",
                }}
            >
                {child}
            </Grid>
        );

        if (renderWrapper) return renderWrapper({ id, active: activeId === id, children: node });
        return node;
    };

    const canDrag = (id: string) => {
        if (isReorderDisabled) return false;
        if (!allowedSet.has(id)) return false;
        if (isItemDraggable) return isItemDraggable(id);
        return true;
    };

    const handleStart = (e: DragStartEvent) => {
        const id = asStringId(e.active.id);
        if (!canDrag(id)) return;
        setActiveId(id);
        onActiveChange?.(id);
        onDragStart?.(e);
    };

    const handleCancel = (e: DragCancelEvent) => {
        setActiveId(null);
        onActiveChange?.(null);
        onDragCancel?.(e);
    };

    const handleEnd = (e: DragEndEvent) => {
        onDragEnd?.(e);

        const { active, over } = e;
        setActiveId(null);
        onActiveChange?.(null);

        if (isReorderDisabled) return;
        if (!over) return;

        const a = asStringId(active.id);
        const o = asStringId(over.id);

        if (!canDrag(a)) return;
        if (!allowedSet.has(o)) return;
        if (a === o) return;

        const oldIndex = order.indexOf(a);
        const newIndex = order.indexOf(o);
        if (oldIndex === -1 || newIndex === -1) return;

        const next = arrayMove(order, oldIndex, newIndex);
        const same = next.length === order.length && next.every((x, i) => x === order[i]);
        if (same) return;

        onOrderChange(next);
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleStart}
            onDragCancel={handleCancel}
            onDragEnd={handleEnd}
        >
            <SortableContext items={items} strategy={rectSortingStrategy}>
                <Grid container spacing={spacing}>
                    {order.map((id) => wrap(id, render(id)))}
                </Grid>
            </SortableContext>
        </DndContext>
    );
}

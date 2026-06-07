import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import CloseIcon from "@mui/icons-material/Close";
import Tooltip from "@mui/material/Tooltip";
import Stack from "@mui/material/Stack";
import Divider from "@mui/material/Divider";
import type { SxProps, Theme } from "@mui/material/styles";
import { GlowCard } from "./GlowCard";

type WidgetItem = {
    id: string;
    title: string;
    icon?: string;
    content: ReactNode;
};

type Props = {
    widgets: WidgetItem[];
    cardSx?: SxProps<Theme>;
    showDragHandle?: boolean;
    dragHandleClassName?: string;
    onSplit?: (widgetId: string) => void;
};

export function CombinedWidgetCard({
    widgets,
    cardSx,
    showDragHandle = true,
    dragHandleClassName = "drag-handle",
    onSplit,
}: Props) {
    return (
        <GlowCard
            sx={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                ...(cardSx as object),
            }}
        >
            {/* Header */}
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    mb: 1,
                    minWidth: 0,
                }}
            >
                <Typography
                    variant="h6"
                    sx={{
                        fontWeight: 950,
                        lineHeight: 1.15,
                        fontSize: 16,
                    }}
                >
                    {widgets.map((w) => w.icon || "").join(" ")} Combined
                </Typography>

                {/* Drag handle */}
                {showDragHandle && (
                    <Tooltip title="Drag">
                        <IconButton
                            size="small"
                            className={dragHandleClassName}
                            sx={{ cursor: "grab", "&:active": { cursor: "grabbing" }, flexShrink: 0 }}
                        >
                            <DragIndicatorIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>

            {/* Stacked content */}
            <Stack
                spacing={2}
                divider={<Divider sx={{ opacity: 0.2 }} />}
                sx={{
                    flex: 1,
                    minHeight: 0,
                    overflow: "auto",
                    pr: 1,
                }}
            >
                {widgets.map((widget) => (
                    <Box key={widget.id} sx={{ position: "relative" }}>
                        {/* Widget header with split button */}
                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                            <Typography sx={{ fontSize: 14, fontWeight: 800, color: "rgba(37,243,225,0.9)" }}>
                                {widget.icon} {widget.title}
                            </Typography>
                            {onSplit && widgets.length > 1 && (
                                <Tooltip title="Split into separate widget">
                                    <IconButton
                                        size="small"
                                        onClick={() => onSplit(widget.id)}
                                        sx={{
                                            p: 0.25,
                                            color: "rgba(255,255,255,0.4)",
                                            "&:hover": { color: "rgba(255,255,255,0.8)" },
                                        }}
                                    >
                                        <CloseIcon sx={{ fontSize: 16 }} />
                                    </IconButton>
                                </Tooltip>
                            )}
                        </Box>
                        {/* Widget content */}
                        <Box>{widget.content}</Box>
                    </Box>
                ))}
            </Stack>
        </GlowCard>
    );
}

// Keep TabbedWidgetCard for backward compatibility but export CombinedWidgetCard as main
export function TabbedWidgetCard({
    tabs,
    cardSx,
    showDragHandle = true,
    dragHandleClassName = "drag-handle",
    onSplit,
}: {
    tabs: WidgetItem[];
    defaultTab?: string;
    cardSx?: SxProps<Theme>;
    bodySx?: SxProps<Theme>;
    showDragHandle?: boolean;
    dragHandleClassName?: string;
    onSplit?: (tabId: string) => void;
}) {
    // Now renders as stacked, not tabs
    return (
        <CombinedWidgetCard
            widgets={tabs}
            cardSx={cardSx}
            showDragHandle={showDragHandle}
            dragHandleClassName={dragHandleClassName}
            onSplit={onSplit}
        />
    );
}

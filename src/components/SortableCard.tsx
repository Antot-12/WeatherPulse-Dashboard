import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import type { UniqueIdentifier } from "@dnd-kit/core";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import Typography from "@mui/material/Typography";
import { GlowCard } from "./GlowCard";

type Props = {
  id: UniqueIdentifier;
  title: React.ReactNode;
  children: React.ReactNode;

  right?: React.ReactNode;
  dragHandle?: "icon" | "header" | "none";
  disabled?: boolean;
  selected?: boolean;
  dense?: boolean;

  onClick?: () => void;
  onDoubleClick?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;

  headerSx?: Record<string, unknown>;
  cardSx?: Record<string, unknown>;
};

export function SortableCard({
                               id,
                               title,
                               children,
                               right,
                               dragHandle = "icon",
                               disabled = false,
                               selected = false,
                               dense = false,
                               onClick,
                               onDoubleClick,
                               onKeyDown,
                               headerSx,
                               cardSx,
                             }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.92 : 1,
  };

  const handleAttrs = dragHandle === "icon" ? attributes : undefined;
  const handleListeners = dragHandle === "icon" ? listeners : undefined;

  const headerAttrs = dragHandle === "header" ? attributes : undefined;
  const headerListeners = dragHandle === "header" ? listeners : undefined;

  return (
      <Box ref={setNodeRef} style={style}>
        <GlowCard
            interactive={!disabled}
            selected={selected}
            dense={dense}
            sx={{
              height: "100%",
              display: "flex",
              flexDirection: "column",
              ...(cardSx ?? {}),
            }}
        >
          <Box
              display="flex"
              alignItems="center"
              justifyContent="space-between"
              gap={1}
              mb={dense ? 0.75 : 1}
              tabIndex={disabled ? -1 : 0}
              role={onClick ? "button" : undefined}
              onClick={onClick}
              onDoubleClick={onDoubleClick}
              onKeyDown={onKeyDown}
              sx={{
                minWidth: 0,
                outline: 0,
                borderRadius: 12,
                px: 0.25,
                py: 0.25,
                ...(dragHandle === "header"
                    ? {
                      cursor: disabled ? "default" : "grab",
                      "&:active": { cursor: disabled ? "default" : "grabbing" },
                    }
                    : {}),
                "&:focus-visible": {
                  boxShadow: "0 0 0 3px rgba(37,243,225,0.14)",
                },
                ...(headerSx ?? {}),
              }}
              {...headerAttrs}
              {...headerListeners}
          >
            {typeof title === "string" ? (
                <Typography
                    variant="subtitle1"
                    sx={{
                      fontWeight: 950,
                      lineHeight: 1.15,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                >
                  {title}
                </Typography>
            ) : (
                <Box
                    sx={{
                      fontWeight: 950,
                      lineHeight: 1.15,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                >
                  {title}
                </Box>
            )}

            <Box display="flex" alignItems="center" gap={0.75} sx={{ flexShrink: 0 }}>
              {right}
              {dragHandle !== "none" && (
                  <IconButton
                      size="small"
                      disabled={disabled}
                      {...handleAttrs}
                      {...handleListeners}
                      sx={{
                        cursor: disabled ? "default" : "grab",
                        "&:active": { cursor: disabled ? "default" : "grabbing" },
                      }}
                  >
                    <DragIndicatorIcon fontSize="small" />
                  </IconButton>
              )}
            </Box>
          </Box>

          <Box sx={{ flex: 1, minHeight: 0, overflow: "auto", pr: 0.5 }}>{children}</Box>
        </GlowCard>
      </Box>
  );
}

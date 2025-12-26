import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import Divider from "@mui/material/Divider";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import type { ReactNode } from "react";
import type { SxProps, Theme } from "@mui/material/styles";
import { GlowCard } from "./GlowCard";

type Props = {
    title: string;
    children: ReactNode;

    right?: ReactNode;
    left?: ReactNode;
    subtitle?: ReactNode;

    scroll?: boolean;
    bodySx?: SxProps<Theme>;
    headerSx?: SxProps<Theme>;
    cardSx?: SxProps<Theme>;

    dense?: boolean;
    divider?: boolean;

    maxTitleWidth?: number | string;

    badge?: ReactNode;
    badgeText?: string;

    loading?: boolean;
    loadingText?: string;

    onHeaderClick?: () => void;
    onHeaderDoubleClick?: () => void;

    showDragHandle?: boolean;
    dragHandleClassName?: string;

    actionTitle?: string;
};

export function WidgetCard({
                               title,
                               children,
                               right,
                               left,
                               subtitle,
                               scroll = false,
                               bodySx,
                               headerSx,
                               cardSx,
                               dense = false,
                               divider = false,
                               maxTitleWidth = 260,
                               badge,
                               badgeText,
                               loading = false,
                               loadingText = "Loading…",
                               onHeaderClick,
                               onHeaderDoubleClick,
                               showDragHandle = true,
                               dragHandleClassName = "drag-handle",
                               actionTitle = "Drag",
                           }: Props) {
    const headerPadY = dense ? 0.5 : 0.75;
    const headerGap = dense ? 0.75 : 1;

    return (
        <GlowCard
            sx={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                ...(cardSx as object),
            }}
        >
            <Box
                display="flex"
                alignItems={subtitle ? "flex-start" : "center"}
                justifyContent="space-between"
                gap={headerGap}
                mb={dense ? 0.75 : 1}
                onClick={onHeaderClick}
                onDoubleClick={onHeaderDoubleClick}
                sx={{
                    minWidth: 0,
                    px: dense ? 0.25 : 0.5,
                    py: headerPadY,
                    borderRadius: 14,
                    ...(onHeaderClick
                        ? {
                            cursor: "pointer",
                            "&:active": { transform: "translateY(0.5px)" },
                        }
                        : {}),
                    ...(headerSx as object),
                }}
            >
                <Box sx={{ minWidth: 0, flex: 1, display: "flex", alignItems: subtitle ? "flex-start" : "center", gap: 1 }}>
                    {left}
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Box display="flex" alignItems="center" gap={1} sx={{ minWidth: 0 }}>
                            <Typography
                                variant="h6"
                                sx={{
                                    fontWeight: 950,
                                    lineHeight: 1.15,
                                    minWidth: 0,
                                    maxWidth: maxTitleWidth,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {title}
                            </Typography>

                            {badge ? (
                                <Box sx={{ flexShrink: 0 }}>{badge}</Box>
                            ) : badgeText ? (
                                <Chip size="small" label={badgeText} variant="outlined" color="primary" sx={{ flexShrink: 0 }} />
                            ) : null}
                        </Box>

                        {subtitle ? (
                            <Typography
                                variant="caption"
                                color="text.secondary"
                                sx={{
                                    display: "block",
                                    mt: 0.25,
                                    fontSize: 12,
                                    fontWeight: 800,
                                    minWidth: 0,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {subtitle}
                            </Typography>
                        ) : null}
                    </Box>
                </Box>

                <Box display="flex" alignItems="center" gap={1} sx={{ minWidth: 0, flexShrink: 0 }}>
                    {right}

                    {showDragHandle && (
                        <Tooltip title={actionTitle}>
                            <IconButton
                                size="small"
                                className={dragHandleClassName}
                                sx={{ cursor: "grab", "&:active": { cursor: "grabbing" } }}
                            >
                                <DragIndicatorIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    )}
                </Box>
            </Box>

            {divider && <Divider sx={{ opacity: 0.55, mb: dense ? 0.75 : 1 }} />}

            <Box
                sx={{
                    flex: 1,
                    minHeight: 0,
                    overflow: scroll ? "auto" : "hidden",
                    pr: scroll ? 0.5 : 0,
                    display: "flex",
                    flexDirection: "column",
                    ...(bodySx as object),
                }}
            >
                {loading ? (
                    <Box
                        sx={{
                            flex: 1,
                            minHeight: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            px: 1,
                        }}
                    >
                        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 900 }}>
                            {loadingText}
                        </Typography>
                    </Box>
                ) : (
                    children
                )}
            </Box>
        </GlowCard>
    );
}

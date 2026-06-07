import { useState } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import MergeIcon from "@mui/icons-material/CallMerge";
import Divider from "@mui/material/Divider";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import type { ReactNode } from "react";
import type { SxProps, Theme } from "@mui/material/styles";
import { GlowCard } from "./GlowCard";

type CombineOption = {
    id: string;
    label: string;
};

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

    // Combine feature
    combineOptions?: CombineOption[];
    onCombine?: (targetId: string) => void;
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
                               badge,
                               badgeText,
                               loading = false,
                               loadingText = "Loading…",
                               onHeaderClick,
                               onHeaderDoubleClick,
                               showDragHandle = true,
                               dragHandleClassName = "drag-handle",
                               actionTitle = "Drag",
                               combineOptions,
                               onCombine,
                           }: Props) {
    const headerPadY = dense ? 0.5 : 0.75;
    const headerGap = dense ? 0.75 : 1;

    const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
    const menuOpen = Boolean(menuAnchor);

    const handleCombineClick = (e: React.MouseEvent<HTMLElement>) => {
        e.stopPropagation();
        setMenuAnchor(e.currentTarget);
    };

    const handleMenuClose = () => {
        setMenuAnchor(null);
    };

    const handleCombineSelect = (targetId: string) => {
        handleMenuClose();
        onCombine?.(targetId);
    };

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

                <Box display="flex" alignItems="center" gap={0.5} sx={{ minWidth: 0, flexShrink: 0 }}>
                    {right}

                    {combineOptions && combineOptions.length > 0 && onCombine && (
                        <>
                            <Tooltip title="Combine with another widget">
                                <IconButton
                                    size="small"
                                    onClick={handleCombineClick}
                                    sx={{
                                        color: "rgba(37,243,225,0.6)",
                                        "&:hover": { color: "rgba(37,243,225,0.9)" }
                                    }}
                                >
                                    <MergeIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                            <Menu
                                anchorEl={menuAnchor}
                                open={menuOpen}
                                onClose={handleMenuClose}
                                anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                                transformOrigin={{ vertical: "top", horizontal: "right" }}
                                slotProps={{
                                    paper: {
                                        sx: {
                                            background: "rgba(14,18,24,0.95)",
                                            border: "1px solid rgba(37,243,225,0.2)",
                                            borderRadius: 1,
                                            minWidth: 150,
                                        }
                                    }
                                }}
                            >
                                <Typography sx={{ px: 2, py: 1, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>
                                    Combine with
                                </Typography>
                                {combineOptions.map((opt) => (
                                    <MenuItem
                                        key={opt.id}
                                        onClick={() => handleCombineSelect(opt.id)}
                                        sx={{
                                            fontSize: 13,
                                            fontWeight: 600,
                                            "&:hover": { background: "rgba(37,243,225,0.1)" }
                                        }}
                                    >
                                        {opt.label}
                                    </MenuItem>
                                ))}
                            </Menu>
                        </>
                    )}

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
                    overflow: scroll ? "auto" : "visible",
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

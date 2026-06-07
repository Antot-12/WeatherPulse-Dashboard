import { useState } from "react";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import CloseIcon from "@mui/icons-material/Close";
import { GlowCard } from "./GlowCard";
import { TempLineChart } from "./TempLineChart";
import { HumidityChart } from "./HumidityChart";
import { WindChart } from "./WindChart";
import { ChartSkeleton } from "./Skeletons";
import { ChartPlaceholder } from "./EmptyStates";
import type { ForecastPoint } from "../types";

type ChartType = "forecast" | "humidity" | "wind";

type Props = {
    charts: ChartType[];
    data: ForecastPoint[];
    loading?: boolean;
    onSplit?: (chartId: ChartType) => void;
};

const CHART_META: Record<ChartType, { title: string; icon: string }> = {
    forecast: { title: "Temperature", icon: "🌡️" },
    humidity: { title: "Humidity", icon: "💧" },
    wind: { title: "Wind", icon: "💨" },
};

export function CombinedChartWidget({ charts, data, loading, onSplit }: Props) {
    const [rangeHours, setRangeHours] = useState(120);
    const [step, setStep] = useState(1);

    // Filter data based on range and step
    const filteredData = (() => {
        if (!data.length) return [];
        const start = data[0].date.getTime();
        const end = start + rangeHours * 3600_000;
        const slice = data.filter((p) => p.date.getTime() <= end);
        const s = Math.max(1, step);
        return slice.filter((_, i) => i % s === 0);
    })();

    const title = charts.map((c) => CHART_META[c].icon).join(" ") + " Charts";

    const rangeChips = (
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ minWidth: 0, justifyContent: "center" }}>
            {[24, 48, 72, 120].map((h) => (
                <Chip
                    key={h}
                    size="small"
                    label={`${h}h`}
                    color={rangeHours === h ? "primary" : "default"}
                    variant="outlined"
                    onClick={() => setRangeHours(h)}
                    sx={{ cursor: "pointer", borderRadius: 1 }}
                />
            ))}
            <Divider flexItem orientation="vertical" sx={{ mx: 0.5, opacity: 0.5 }} />
            {[
                { s: 1, label: "3h" },
                { s: 2, label: "6h" },
                { s: 4, label: "12h" },
            ].map((x) => (
                <Chip
                    key={x.s}
                    size="small"
                    label={x.label}
                    color={step === x.s ? "primary" : "default"}
                    variant="outlined"
                    onClick={() => setStep(x.s)}
                    sx={{ cursor: "pointer", borderRadius: 1 }}
                />
            ))}
        </Stack>
    );

    const renderChart = (chartType: ChartType) => {
        if (loading && !data.length) {
            return <ChartSkeleton height={140} />;
        }
        if (data.length < 2) {
            return <ChartPlaceholder height={140} />;
        }

        switch (chartType) {
            case "forecast":
                return <TempLineChart data={filteredData} />;
            case "humidity":
                return <HumidityChart data={filteredData} />;
            case "wind":
                return <WindChart data={filteredData} />;
        }
    };

    return (
        <GlowCard
            sx={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
            }}
        >
            {/* Header */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 950, lineHeight: 1.15 }}>
                    {title}
                </Typography>
                <Tooltip title="Drag">
                    <IconButton
                        size="small"
                        className="drag-handle"
                        sx={{ cursor: "grab", "&:active": { cursor: "grabbing" } }}
                    >
                        <DragIndicatorIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            </Box>

            {/* Shared time controls */}
            <Box sx={{ mb: 1.5 }}>{rangeChips}</Box>

            {/* Charts */}
            <Stack
                spacing={1.5}
                sx={{
                    flex: 1,
                    minHeight: 0,
                    overflow: "auto",
                    pr: 1,
                }}
            >
                {charts.map((chartType) => (
                    <Box
                        key={chartType}
                        sx={{
                            p: 1.5,
                            borderRadius: 1,
                            background: "rgba(14,18,24,0.5)",
                            border: "1px solid rgba(37,243,225,0.1)",
                        }}
                    >
                        {/* Chart header */}
                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                            <Typography sx={{ fontSize: 13, fontWeight: 800, color: "rgba(37,243,225,0.9)" }}>
                                {CHART_META[chartType].icon} {CHART_META[chartType].title}
                            </Typography>
                            {onSplit && charts.length > 1 && (
                                <Tooltip title="Split into separate widget">
                                    <IconButton
                                        size="small"
                                        onClick={() => onSplit(chartType)}
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
                        {/* Chart */}
                        <Box sx={{ height: 140 }}>{renderChart(chartType)}</Box>
                    </Box>
                ))}
            </Stack>
        </GlowCard>
    );
}

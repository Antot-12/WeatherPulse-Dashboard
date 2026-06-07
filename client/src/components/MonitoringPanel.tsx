import * as d3 from "d3";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import RefreshIcon from "@mui/icons-material/Refresh";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import Collapse from "@mui/material/Collapse";
import { getMetrics } from "../api";

type Metrics = {
    uptimeSec: number;
    node: string;
    updatedAt: string;
    requestsTotal: number;
    errorsTotal: number;
    req1m: number;
    rps1m: number;
    errors1m: number;
    openWeatherCalls: number;
    openWeatherErrors: number;
    owErrors1m: number;
    lastLatencyMs: number;
    avgLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    cacheSize: number;
    cacheHits: number;
    cacheMisses: number;
    cacheHitRate: number;
    cacheHits1m: number;
    cacheMisses1m: number;
    cacheHitRate1m: number;
    latencySeries: number[];
    rpsSeries: number[];
    eventLoopLagSeries: number[];
    eventLoopLagLastMs: number;
    eventLoopLagAvgMs: number;
    eventLoopLagP95Ms: number;
    topRoutes: { route: string; count: number }[];
    statusCounts: Record<string, number>;
    openWeatherStatusCounts: Record<string, number>;
    memoryMB: {
        rss: number;
        heapUsed: number;
        heapTotal: number;
        external: number;
    };
};

type PanelProps = {
    pollMs?: number;
    startCollapsed?: boolean;
    onMetrics?: (m: Metrics) => void;
    onError?: (message: string) => void;
};

function formatUptime(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function safeSeries(values: number[]) {
    return (values ?? []).filter((x) => Number.isFinite(x));
}

function slope(values: number[]) {
    const v = safeSeries(values);
    if (v.length < 2) return 0;
    const n = v.length;
    const xMean = (n - 1) / 2;
    const yMean = v.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
        const dx = i - xMean;
        const dy = v[i] - yMean;
        num += dx * dy;
        den += dx * dx;
    }
    return den === 0 ? 0 : num / den;
}

function trendLabel(values: number[]) {
    const s = slope(values);
    if (Math.abs(s) < 1e-9) return "stable";
    return s > 0 ? "↑" : "↓";
}

function MiniSparkline({ values, color = "rgba(37,243,225,0.9)" }: { values: number[]; color?: string }) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const ref = useRef<SVGSVGElement | null>(null);
    const [size, setSize] = useState({ width: 120, height: 28 });

    // Measure actual container size
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const measure = () => {
            const rect = container.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                setSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
            }
        };

        measure();

        const ro = new ResizeObserver(measure);
        ro.observe(container);
        return () => ro.disconnect();
    }, []);

    const actualWidth = size.width;
    const actualHeight = size.height;

    useEffect(() => {
        const el = ref.current;
        if (!el || actualWidth < 20 || actualHeight < 10) return;

        const svg = d3.select<SVGSVGElement, unknown>(el);
        svg.selectAll("*").remove();

        const pad = 2;

        svg
            .attr("width", actualWidth)
            .attr("height", actualHeight)
            .style("display", "block");

        const v = safeSeries(values);
        if (v.length < 2) return;

        const data = v.map((vv, i) => ({ i, v: vv }));
        const x = d3.scaleLinear().domain([0, data.length - 1]).range([pad, actualWidth - pad]);
        const ext = d3.extent(data, (d) => d.v) as [number, number];
        const span = Math.max(1e-9, ext[1] - ext[0]);
        const y = d3.scaleLinear().domain([ext[0] - span * 0.1, ext[1] + span * 0.1]).range([actualHeight - pad, pad]);

        const line = d3.line<{ i: number; v: number }>().x((d) => x(d.i)).y((d) => y(d.v)).curve(d3.curveMonotoneX);

        svg.append("path").datum(data).attr("fill", "none").attr("stroke", color).attr("stroke-width", 2).attr("d", line);
    }, [values, actualWidth, actualHeight, color]);

    return (
        <div ref={containerRef} style={{ width: "100%", height: "28px", flex: 1, minHeight: 0 }}>
            <svg ref={ref} />
        </div>
    );
}

function StatCard({ label, value, subValue, trend, color }: {
    label: string;
    value: string | number;
    subValue?: string;
    trend?: string;
    color?: string;
}) {
    return (
        <Box
            sx={{
                p: 1,
                borderRadius: 1,
                background: "rgba(14, 18, 24, 0.5)",
                border: "1px solid rgba(37,243,225,0.15)",
                minWidth: 0,
                textAlign: "center",
                overflow: "hidden",
            }}
        >
            <Typography
                sx={{
                    color: "rgba(255,255,255,0.6)",
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    mb: 0.25,
                }}
            >
                {label}
            </Typography>
            <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 0.5 }}>
                <Typography
                    sx={{
                        fontSize: 16,
                        fontWeight: 900,
                        color: color || "rgba(255,255,255,0.95)",
                        lineHeight: 1,
                    }}
                >
                    {value}
                </Typography>
                {subValue && (
                    <Typography sx={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 700 }}>
                        {subValue}
                    </Typography>
                )}
                {trend && trend !== "stable" && (
                    <Typography sx={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: "rgba(37,243,225,0.8)",
                        ml: 0.25,
                    }}>
                        {trend}
                    </Typography>
                )}
            </Box>
        </Box>
    );
}

export function MonitoringPanel({
    pollMs = 5000,
    startCollapsed = false,
    onMetrics,
    onError,
}: PanelProps) {
    const [m, setM] = useState<Metrics | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [collapsed, setCollapsed] = useState(startCollapsed);
    const [paused, setPaused] = useState(false);

    const refresh = useCallback(async () => {
        try {
            const metrics = (await getMetrics()) as Metrics;
            setM(metrics);
            setError(null);
            onMetrics?.(metrics);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Failed to load metrics";
            setError(msg);
            onError?.(msg);
        }
    }, [onMetrics, onError]);

    useEffect(() => {
        let alive = true;
        let id: number | null = null;
        const tick = async () => {
            if (!alive || paused) return;
            await refresh();
        };
        tick();
        id = window.setInterval(tick, pollMs);
        return () => {
            alive = false;
            if (id) window.clearInterval(id);
        };
    }, [pollMs, paused, refresh]);

    const health = useMemo(() => {
        if (!m) return { label: "Unknown", color: "default" as const, dotColor: "#888" };
        if (m.errors1m > 0 || m.owErrors1m > 0) return { label: "Degraded", color: "warning" as const, dotColor: "#f59e0b" };
        return { label: "Healthy", color: "success" as const, dotColor: "#22c55e" };
    }, [m]);

    const trendLatency = useMemo(() => (m ? trendLabel(m.latencySeries ?? []) : "stable"), [m]);
    const trendRps = useMemo(() => (m ? trendLabel(m.rpsSeries ?? []) : "stable"), [m]);

    if (!m && !error) {
        return (
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 4 }}>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Connecting to server...
                </Typography>
            </Box>
        );
    }

    return (
        <Stack spacing={1} sx={{ minWidth: 0, pb: 1 }}>
            {/* Header with status and controls */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    {/* Health indicator */}
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Box
                            sx={{
                                width: 10,
                                height: 10,
                                borderRadius: "50%",
                                backgroundColor: health.dotColor,
                                boxShadow: `0 0 8px ${health.dotColor}`,
                                animation: "pulse 2s infinite",
                                "@keyframes pulse": {
                                    "0%, 100%": { opacity: 1 },
                                    "50%": { opacity: 0.5 },
                                },
                            }}
                        />
                        <Typography sx={{ fontSize: 14, fontWeight: 700, color: health.dotColor }}>
                            {health.label}
                        </Typography>
                    </Box>

                    {m && (
                        <Chip
                            size="small"
                            label={`${formatUptime(m.uptimeSec)}`}
                            sx={{
                                height: 24,
                                fontSize: 12,
                                fontWeight: 700,
                                background: "rgba(37,243,225,0.1)",
                                border: "1px solid rgba(37,243,225,0.2)",
                                borderRadius: 1,
                            }}
                        />
                    )}
                </Box>

                {/* Control buttons */}
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <Tooltip title="Refresh">
                        <IconButton size="small" onClick={refresh} sx={{ color: "rgba(37,243,225,0.8)" }}>
                            <RefreshIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title={paused ? "Resume" : "Pause"}>
                        <IconButton
                            size="small"
                            onClick={() => setPaused((x) => !x)}
                            sx={{ color: paused ? "#f59e0b" : "rgba(37,243,225,0.8)" }}
                        >
                            {paused ? <PlayArrowIcon fontSize="small" /> : <PauseIcon fontSize="small" />}
                        </IconButton>
                    </Tooltip>
                    <Tooltip title={collapsed ? "Expand" : "Collapse"}>
                        <IconButton
                            size="small"
                            onClick={() => setCollapsed((x) => !x)}
                            sx={{ color: "rgba(37,243,225,0.8)" }}
                        >
                            {collapsed ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>

            {error && (
                <Box
                    sx={{
                        p: 1,
                        borderRadius: 1,
                        background: "rgba(239,68,68,0.1)",
                        border: "1px solid rgba(239,68,68,0.3)",
                    }}
                >
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: "#f87171" }}>
                        {error}
                    </Typography>
                </Box>
            )}

            <Collapse in={!!m && !collapsed} timeout={200}>
                {m && (
                    <Stack spacing={1}>
                        {/* Key metrics grid */}
                        <Box
                            sx={{
                                display: "grid",
                                gap: 1,
                                gridTemplateColumns: "repeat(4, 1fr)",
                            }}
                        >
                            <StatCard label="RPS" value={m.rps1m.toFixed(2)} trend={trendRps} />
                            <StatCard label="P95 Latency" value={m.p95LatencyMs} subValue="ms" trend={trendLatency} />
                            <StatCard
                                label="Cache Hit"
                                value={`${(m.cacheHitRate1m * 100).toFixed(0)}%`}
                                color={m.cacheHitRate1m > 0.5 ? "rgba(37,243,225,0.95)" : "rgba(255,255,255,0.7)"}
                            />
                            <StatCard label="Errors" value={m.errors1m} color={m.errors1m > 0 ? "#ff6b6b" : "rgba(37,243,225,0.95)"} />
                        </Box>

                        {/* Sparklines */}
                        <Box
                            sx={{
                                display: "grid",
                                gap: 1,
                                gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                            }}
                        >
                            <Box
                                sx={{
                                    p: 1,
                                    borderRadius: 1,
                                    background: "rgba(14,18,24,0.5)",
                                    border: "1px solid rgba(37,243,225,0.1)",
                                    textAlign: "center",
                                    minWidth: 0,
                                    position: "relative",
                                    zIndex: 1,
                                    "&:hover": { zIndex: 10 },
                                }}
                            >
                                <Typography sx={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.6)", mb: 0.5, textTransform: "uppercase" }}>
                                    Latency Trend
                                </Typography>
                                <MiniSparkline values={m.latencySeries ?? []} />
                            </Box>
                            <Box
                                sx={{
                                    p: 1,
                                    borderRadius: 1,
                                    background: "rgba(14,18,24,0.5)",
                                    border: "1px solid rgba(37,243,225,0.1)",
                                    textAlign: "center",
                                    minWidth: 0,
                                    position: "relative",
                                    zIndex: 1,
                                    "&:hover": { zIndex: 10 },
                                }}
                            >
                                <Typography sx={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.6)", mb: 0.5, textTransform: "uppercase" }}>
                                    RPS Trend
                                </Typography>
                                <MiniSparkline values={m.rpsSeries ?? []} color="rgba(74,222,128,0.9)" />
                            </Box>
                        </Box>

                        {/* Additional stats */}
                        <Box
                            sx={{
                                display: "grid",
                                gap: 1,
                                gridTemplateColumns: "repeat(4, 1fr)",
                            }}
                        >
                            {[
                                { label: "Requests", value: m.requestsTotal },
                                { label: "Cache Size", value: m.cacheSize },
                                { label: "OW Calls", value: m.openWeatherCalls },
                                { label: "Memory", value: `${m.memoryMB.heapUsed}MB` },
                            ].map((item) => (
                                <Box
                                    key={item.label}
                                    sx={{
                                        p: 1,
                                        borderRadius: 1,
                                        background: "rgba(14,18,24,0.5)",
                                        border: "1px solid rgba(37,243,225,0.1)",
                                        textAlign: "center",
                                    }}
                                >
                                    <Typography sx={{ fontSize: 10, color: "rgba(255,255,255,0.6)", fontWeight: 700, textTransform: "uppercase", mb: 0.25 }}>
                                        {item.label}
                                    </Typography>
                                    <Typography sx={{ fontSize: 14, fontWeight: 900, color: "rgba(255,255,255,0.95)" }}>
                                        {item.value}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                    </Stack>
                )}
            </Collapse>
        </Stack>
    );
}

import * as d3 from "d3";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Chip from "@mui/material/Chip";
import RefreshIcon from "@mui/icons-material/Refresh";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
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
    onMetrics?: (m: Metrics) => void;
    onError?: (message: string) => void;
};

function formatUptime(sec: number) {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (d > 0) return `${d}d ${h}h ${m}m`;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatAgo(iso: string) {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return "—";
    const diff = Date.now() - t;
    if (diff < 0) return "now";
    const s = Math.floor(diff / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    return `${h}h ago`;
}

function topN(obj: Record<string, number>, n: number) {
    return Object.entries(obj ?? {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([k, v]) => ({ k, v }));
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
        num += (i - xMean) * (v[i] - yMean);
        den += (i - xMean) ** 2;
    }
    return den === 0 ? 0 : num / den;
}

function trendIcon(values: number[]) {
    const s = slope(values);
    if (Math.abs(s) < 1e-9) return { icon: "—", color: "rgba(255,255,255,0.4)" };
    return s > 0 ? { icon: "↑", color: "rgba(37,243,225,0.8)" } : { icon: "↓", color: "rgba(37,243,225,0.8)" };
}

function Sparkline({
    values,
    height = 60,
    color = "rgba(37,243,225,0.95)",
    onHover,
    formatValue,
}: {
    values: number[];
    height?: number;
    color?: string;
    onHover?: (v: number | null) => void;
    formatValue?: (v: number) => string;
}) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const ref = useRef<SVGSVGElement | null>(null);
    const [size, setSize] = useState({ width: 300, height: height });

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
        if (!el || actualWidth < 20 || actualHeight < 20) return;

        const svg = d3.select<SVGSVGElement, unknown>(el);
        svg.selectAll("*").remove();

        const pad = 6;

        svg
            .attr("width", actualWidth)
            .attr("height", actualHeight)
            .style("display", "block");

        const v = safeSeries(values);
        if (v.length < 2) {
            onHover?.(null);
            return;
        }

        const data = v.map((vv, i) => ({ i, v: vv }));
        const x = d3.scaleLinear().domain([0, data.length - 1]).range([pad, actualWidth - pad]);
        const ext = d3.extent(data, (d) => d.v) as [number, number];
        const span = Math.max(1e-9, ext[1] - ext[0]);
        const y = d3.scaleLinear().domain([ext[0] - span * 0.1, ext[1] + span * 0.1]).range([actualHeight - pad, pad]);

        const line = d3.line<{ i: number; v: number }>().x((d) => x(d.i)).y((d) => y(d.v)).curve(d3.curveMonotoneX);

        // Glow
        svg.append("path").datum(data).attr("fill", "none").attr("stroke", color).attr("stroke-opacity", 0.3).attr("stroke-width", 6).attr("filter", "blur(3px)").attr("d", line);
        // Line
        svg.append("path").datum(data).attr("fill", "none").attr("stroke", color).attr("stroke-width", 2.5).attr("d", line);

        if (!onHover) return;

        const bisect = d3.bisector<{ i: number; v: number }, number>((d) => d.i).center;
        const overlay = svg.append("rect").attr("x", pad).attr("y", pad).attr("width", actualWidth - pad * 2).attr("height", actualHeight - pad * 2).attr("fill", "transparent").style("cursor", "crosshair");
        const focus = svg.append("g").style("display", "none");
        const focusDot = focus.append("circle").attr("r", 5).attr("fill", color).attr("stroke", "white").attr("stroke-width", 2);
        const tooltip = svg.append("g").style("display", "none");
        const ttBg = tooltip.append("rect").attr("rx", 4).attr("fill", "rgba(0,0,0,0.85)").attr("stroke", color);
        const ttText = tooltip.append("text").attr("fill", "white").attr("font-size", 12).attr("font-weight", 700);

        function move(mx: number) {
            const idx = Math.max(0, Math.min(data.length - 1, bisect(data, x.invert(mx))));
            const p = data[idx];
            focus.style("display", null);
            tooltip.style("display", null);
            focusDot.attr("cx", x(p.i)).attr("cy", y(p.v));
            onHover?.(p.v);
            ttText.text(formatValue ? formatValue(p.v) : String(p.v));
            const bb = (ttText.node() as SVGTextElement)?.getBBox();
            if (bb) {
                ttBg.attr("width", bb.width + 12).attr("height", bb.height + 8);
                const tx = x(p.i) > actualWidth - 80 ? x(p.i) - bb.width - 20 : x(p.i) + 10;
                tooltip.attr("transform", `translate(${tx},${y(p.v) - 12})`);
                ttText.attr("x", 6).attr("y", bb.height);
            }
        }

        overlay
            .on("pointerenter", () => { focus.style("display", null); tooltip.style("display", null); })
            .on("pointerleave", () => { focus.style("display", "none"); tooltip.style("display", "none"); onHover?.(null); })
            .on("pointermove", (e: PointerEvent) => { const [mx] = d3.pointer(e, overlay.node()!); move(mx + pad); });
    }, [values, actualWidth, actualHeight, color, onHover, formatValue]);

    return (
        <div ref={containerRef} style={{ width: "100%", height: `${height}px`, flex: 1, minHeight: 0 }}>
            <svg ref={ref} />
        </div>
    );
}

function StatBox({ label, value, subValue, color }: {
    label: string;
    value: string | number;
    subValue?: string;
    color?: string;
}) {
    return (
        <Box sx={{
            p: 2,
            borderRadius: 1,
            background: "rgba(14, 18, 24, 0.5)",
            border: "1px solid rgba(37,243,225,0.15)",
            minWidth: 100,
            flex: 1,
            textAlign: "center",
            overflow: "hidden",
        }}>
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: 0.5, mb: 1 }}>
                {label}
            </Typography>
            <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 0.5, flexWrap: "nowrap" }}>
                <Typography sx={{ fontSize: 20, fontWeight: 900, color: color || "rgba(255,255,255,0.95)", lineHeight: 1, whiteSpace: "nowrap" }}>
                    {value}
                </Typography>
                {subValue && <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.5)", fontWeight: 700 }}>{subValue}</Typography>}
            </Box>
        </Box>
    );
}

function SparklineBox({ title, values, color, formatValue, trend }: {
    title: string;
    values: number[];
    color: string;
    formatValue: (v: number) => string;
    trend: { icon: string; color: string };
}) {
    const [hover, setHover] = useState<number | null>(null);
    return (
        <Box sx={{
            p: 2,
            borderRadius: 1,
            background: "rgba(14, 18, 24, 0.5)",
            border: "1px solid rgba(37,243,225,0.1)",
            flex: 1,
            minWidth: 180,
        }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                <Typography sx={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", textTransform: "uppercase" }}>
                    {title} <span style={{ color: trend.color }}>{trend.icon}</span>
                </Typography>
                <Typography sx={{ fontSize: 12, fontWeight: 800, color: "rgba(37,243,225,0.9)" }}>
                    {hover != null ? formatValue(hover) : "—"}
                </Typography>
            </Box>
            <Sparkline values={values} color={color} height={48} onHover={setHover} formatValue={formatValue} />
        </Box>
    );
}

export function ServerStatsPanel({ pollMs = 5000, onMetrics, onError }: PanelProps) {
    const [m, setM] = useState<Metrics | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [paused, setPaused] = useState(false);

    const refresh = useCallback(async () => {
        try {
            const metrics = (await getMetrics()) as Metrics;
            setM(metrics);
            setError(null);
            onMetrics?.(metrics);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Failed";
            setError(msg);
            onError?.(msg);
        }
    }, [onMetrics, onError]);

    useEffect(() => {
        let alive = true;
        const tick = async () => { if (alive && !paused) await refresh(); };
        tick();
        const id = window.setInterval(tick, pollMs);
        return () => { alive = false; window.clearInterval(id); };
    }, [pollMs, paused, refresh]);

    const topStatuses = useMemo(() => (m ? topN(m.statusCounts, 5) : []), [m]);
    const topOwStatuses = useMemo(() => (m ? topN(m.openWeatherStatusCounts, 5) : []), [m]);

    if (!m && !error) {
        return <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", py: 4 }}>
            <Typography color="text.secondary">Loading server stats...</Typography>
        </Box>;
    }

    return (
        <Stack spacing={2.5} sx={{ pb: 1 }}>
            {/* Header */}
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    <Chip size="small" label={`Updated ${m ? formatAgo(m.updatedAt) : "—"}`} sx={{ height: 26, fontSize: 12, fontWeight: 700, background: "rgba(37,243,225,0.15)", border: "1px solid rgba(37,243,225,0.25)", borderRadius: 1 }} />
                    {m && <Chip size="small" label={`Node ${m.node}`} sx={{ height: 26, fontSize: 12, fontWeight: 600, background: "rgba(255,255,255,0.05)", borderRadius: 1 }} />}
                </Box>
                <Box sx={{ display: "flex", gap: 0.5 }}>
                    <Tooltip title="Refresh"><IconButton size="small" onClick={refresh} sx={{ color: "rgba(37,243,225,0.8)" }}><RefreshIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title={paused ? "Resume" : "Pause"}><IconButton size="small" onClick={() => setPaused(x => !x)} sx={{ color: paused ? "#f59e0b" : "rgba(37,243,225,0.8)" }}>{paused ? <PlayArrowIcon fontSize="small" /> : <PauseIcon fontSize="small" />}</IconButton></Tooltip>
                </Box>
            </Box>

            {error && <Box sx={{ p: 2, borderRadius: 1, background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}><Typography sx={{ fontSize: 13, fontWeight: 600, color: "#f87171" }}>{error}</Typography></Box>}

            {m && (
                <>
                    {/* Main Stats Row */}
                    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                        <StatBox label="Uptime" value={formatUptime(m.uptimeSec)} />
                        <StatBox label="RPS" value={m.rps1m.toFixed(2)} subValue="/s" />
                        <StatBox label="P95" value={m.p95LatencyMs} subValue="ms" />
                        <StatBox label="Cache" value={`${(m.cacheHitRate1m * 100).toFixed(0)}%`} color={m.cacheHitRate1m > 0.5 ? "rgba(37,243,225,0.95)" : "rgba(255,255,255,0.7)"} />
                        <StatBox label="Errors" value={m.errors1m} color={m.errors1m > 0 ? "#ff6b6b" : "rgba(37,243,225,0.95)"} />
                        <StatBox label="OW Err" value={m.owErrors1m} color={m.owErrors1m > 0 ? "#ff6b6b" : "rgba(37,243,225,0.95)"} />
                    </Box>

                    {/* Sparklines Row */}
                    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                        <SparklineBox title="Latency" values={m.latencySeries ?? []} color="rgba(37,243,225,0.9)" formatValue={v => `${Math.round(v)}ms`} trend={trendIcon(m.latencySeries ?? [])} />
                        <SparklineBox title="RPS" values={m.rpsSeries ?? []} color="rgba(74,222,128,0.9)" formatValue={v => v.toFixed(3)} trend={trendIcon(m.rpsSeries ?? [])} />
                        <SparklineBox title="Loop Lag" values={m.eventLoopLagSeries ?? []} color="rgba(251,191,36,0.9)" formatValue={v => `${Math.round(v)}ms`} trend={trendIcon(m.eventLoopLagSeries ?? [])} />
                    </Box>

                    {/* Bottom Row - Routes & Status Codes */}
                    <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                        {/* Top Routes */}
                        <Box sx={{ flex: 2, minWidth: 220, p: 2, borderRadius: 1, background: "rgba(14, 18, 24, 0.5)", border: "1px solid rgba(37,243,225,0.1)" }}>
                            <Typography sx={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", mb: 1.5 }}>Top Routes</Typography>
                            <Stack spacing={1}>
                                {(m.topRoutes ?? []).slice(0, 4).map((r, i) => (
                                    <Box key={r.route} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                        <Typography sx={{ fontSize: 10, fontWeight: 700, color: "rgba(37,243,225,0.5)", minWidth: 18 }}>#{i + 1}</Typography>
                                        <Typography sx={{ fontSize: 12, color: "rgba(255,255,255,0.7)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.route}</Typography>
                                        <Typography sx={{ fontSize: 12, fontWeight: 800, color: "rgba(37,243,225,0.8)" }}>{r.count}</Typography>
                                    </Box>
                                ))}
                            </Stack>
                        </Box>

                        {/* HTTP Status Codes */}
                        <Box sx={{ flex: 1, minWidth: 130, p: 2, borderRadius: 1, background: "rgba(14, 18, 24, 0.5)", border: "1px solid rgba(37,243,225,0.1)" }}>
                            <Typography sx={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", mb: 1.5 }}>HTTP</Typography>
                            <Stack spacing={1}>
                                {topStatuses.slice(0, 4).map((x) => (
                                    <Box key={x.k} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <Typography sx={{ fontSize: 12, fontWeight: 800, color: x.k.startsWith("2") ? "rgba(37,243,225,0.9)" : x.k.startsWith("4") ? "rgba(255,255,255,0.6)" : "#ff6b6b" }}>{x.k}</Typography>
                                        <Typography sx={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.8)" }}>{x.v}</Typography>
                                    </Box>
                                ))}
                            </Stack>
                        </Box>

                        {/* OpenWeather Status */}
                        <Box sx={{ flex: 1, minWidth: 130, p: 2, borderRadius: 1, background: "rgba(14, 18, 24, 0.5)", border: "1px solid rgba(37,243,225,0.1)" }}>
                            <Typography sx={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", mb: 1.5 }}>OpenWeather</Typography>
                            <Stack spacing={1}>
                                {topOwStatuses.slice(0, 4).map((x) => (
                                    <Box key={x.k} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <Typography sx={{ fontSize: 12, fontWeight: 800, color: x.k.startsWith("2") ? "rgba(37,243,225,0.9)" : x.k.startsWith("4") ? "rgba(255,255,255,0.6)" : "#ff6b6b" }}>{x.k}</Typography>
                                        <Typography sx={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.8)" }}>{x.v}</Typography>
                                    </Box>
                                ))}
                            </Stack>
                        </Box>

                        {/* Memory Stats */}
                        <Box sx={{ flex: 1, minWidth: 130, p: 2, borderRadius: 1, background: "rgba(14, 18, 24, 0.5)", border: "1px solid rgba(37,243,225,0.1)" }}>
                            <Typography sx={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", mb: 1.5 }}>Memory</Typography>
                            <Stack spacing={1}>
                                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                                    <Typography sx={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>RSS</Typography>
                                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{m.memoryMB.rss}MB</Typography>
                                </Box>
                                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                                    <Typography sx={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Heap</Typography>
                                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{m.memoryMB.heapUsed}MB</Typography>
                                </Box>
                                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                                    <Typography sx={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Cache</Typography>
                                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>{m.cacheSize}</Typography>
                                </Box>
                            </Stack>
                        </Box>
                    </Box>
                </>
            )}
        </Stack>
    );
}

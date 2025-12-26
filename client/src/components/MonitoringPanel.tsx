import * as d3 from "d3";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
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
    topNRoutes?: number;
    topNStatuses?: number;
    showSparklines?: boolean;
    showUpdatedChip?: boolean;
    onMetrics?: (m: Metrics) => void;
    onError?: (message: string) => void;
};

function formatUptime(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
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
    if (h < 48) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
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
        const dx = i - xMean;
        const dy = v[i] - yMean;
        num += dx * dy;
        den += dx * dx;
    }
    return den === 0 ? 0 : num / den;
}

function trendLabel(values: number[]) {
    const s = slope(values);
    if (Math.abs(s) < 1e-9) return "flat";
    return s > 0 ? "up" : "down";
}

function Sparkline({
                       values,
                       height = 92,
                       onHover,
                       formatValue,
                   }: {
    values: number[];
    height?: number;
    onHover?: (v: number | null, index: number | null) => void;
    formatValue?: (v: number) => string;
}) {
    const ref = useRef<SVGSVGElement | null>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const svg = d3.select<SVGSVGElement, unknown>(el);
        svg.selectAll("*").remove();

        const width = 560;
        const pad = 10;

        svg
            .attr("viewBox", `0 0 ${width} ${height}`)
            .attr("preserveAspectRatio", "none")
            .style("width", "100%")
            .style("height", `${height}px`)
            .style("display", "block");

        const v = safeSeries(values);
        if (v.length < 2) {
            onHover?.(null, null);
            return;
        }

        const data = v.map((vv, i) => ({ i, v: vv }));
        const x = d3.scaleLinear().domain([0, data.length - 1]).range([pad, width - pad]);

        const ext = d3.extent(data, (d) => d.v) as [number, number];
        const span = Math.max(1e-9, ext[1] - ext[0]);
        const y = d3
            .scaleLinear()
            .domain([ext[0] - span * 0.08, ext[1] + span * 0.08])
            .nice()
            .range([height - pad, pad]);

        const line = d3
            .line<{ i: number; v: number }>()
            .x((d) => x(d.i))
            .y((d) => y(d.v))
            .curve(d3.curveMonotoneX);

        svg.append("path").datum(data).attr("fill", "none").attr("stroke", "rgba(37,243,225,0.26)").attr("stroke-width", 8).attr("filter", "blur(2px)").attr("d", line);

        svg.append("path").datum(data).attr("fill", "none").attr("stroke", "rgba(37,243,225,0.95)").attr("stroke-width", 2.6).attr("d", line);

        if (!onHover) return;

        const hover = onHover;
        const fmt = formatValue;

        const bisect = d3.bisector<{ i: number; v: number }, number>((d) => d.i).center;

        const overlay = svg
            .append("rect")
            .attr("x", pad)
            .attr("y", pad)
            .attr("width", width - pad * 2)
            .attr("height", height - pad * 2)
            .attr("fill", "transparent")
            .style("cursor", "crosshair")
            .style("touch-action", "none");

        const focus = svg.append("g").style("display", "none");
        const focusDot = focus
            .append("circle")
            .attr("r", 4.5)
            .attr("fill", "rgba(37,243,225,0.98)")
            .attr("stroke", "rgba(37,243,225,0.30)")
            .attr("stroke-width", 8)
            .attr("filter", "blur(0.2px)");

        const tooltip = svg.append("g").style("display", "none").attr("pointer-events", "none");
        const ttBg = tooltip.append("rect").attr("rx", 10).attr("ry", 10).attr("fill", "rgba(10,14,22,0.92)").attr("stroke", "rgba(37,243,225,0.20)");
        const ttText = tooltip.append("text").attr("fill", "rgba(255,255,255,0.94)").attr("font-size", 12).attr("font-weight", 900);

        function move(mx: number) {
            const iFloat = x.invert(mx);
            const idx = bisect(data, iFloat);
            const i = Math.max(0, Math.min(data.length - 1, idx));
            const p = data[i];

            focus.style("display", null);
            tooltip.style("display", null);

            const cx = x(p.i);
            const cy = y(p.v);
            focusDot.attr("cx", cx).attr("cy", cy);

            hover(p.v, i);

            const label = fmt ? fmt(p.v) : String(p.v);

            ttText.selectAll("*").remove();
            ttText.append("tspan").attr("x", 0).attr("dy", "1.15em").text(label);

            const bb = (ttText.node() as SVGTextElement | null)?.getBBox();
            if (!bb) return;

            const pad2 = 10;
            ttBg.attr("width", bb.width + pad2 * 2).attr("height", bb.height + pad2 * 2);

            const placeLeft = cx > width - pad - (bb.width + pad2 * 2) - 24;
            const tx = placeLeft ? cx - (bb.width + pad2 * 2) - 12 : cx + 12;
            const ty = Math.max(pad, Math.min(cy - (bb.height + pad2 * 2) / 2, height - pad - (bb.height + pad2 * 2)));

            tooltip.attr("transform", `translate(${tx},${ty})`);
            ttText.attr("transform", `translate(${pad2},${pad2 - 7})`);
        }

        overlay
            .on("pointerenter", () => {
                focus.style("display", null);
                tooltip.style("display", null);
            })
            .on("pointerleave", () => {
                focus.style("display", "none");
                tooltip.style("display", "none");
                hover(null, null);
            })
            .on("pointermove", (event: PointerEvent) => {
                const node = overlay.node();
                if (!node) return;
                const [mx] = d3.pointer(event, node);
                move(mx + pad);
            });
    }, [values, height, onHover, formatValue]);

    return <svg ref={ref} style={{ width: "100%", height: `${height}px`, display: "block" }} />;
}

function StatCell({ label, value, emphasize }: { label: string; value: ReactNode; emphasize?: boolean }) {
    return (
        <Box
            sx={{
                p: 1.2,
                borderRadius: 14,
                border: "1px solid rgba(37,243,225,0.12)",
                background: "rgba(14, 18, 24, 0.45)",
                minWidth: 0,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                textAlign: "center",
            }}
        >
            <Typography
                variant="caption"
                color="text.secondary"
                sx={{
                    fontSize: 12,
                    display: "block",
                    width: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    textAlign: "center",
                }}
                noWrap
            >
                {label}
            </Typography>
            <Typography
                variant="body2"
                sx={{
                    fontWeight: 950,
                    mt: 0.25,
                    fontSize: emphasize ? 16 : 14,
                    lineHeight: 1.15,
                    width: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    textAlign: "center",
                    wordBreak: "break-word",
                    display: "-webkit-box",
                    WebkitBoxOrient: "vertical",
                    WebkitLineClamp: emphasize ? 1 : 2,
                }}
            >
                {value}
            </Typography>
        </Box>
    );
}

export function MonitoringPanel({
                                    pollMs = 5000,
                                    startCollapsed = false,
                                    topNRoutes = 6,
                                    topNStatuses = 4,
                                    showSparklines = true,
                                    showUpdatedChip = true,
                                    onMetrics,
                                    onError,
                                }: PanelProps) {
    const [m, setM] = useState<Metrics | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [collapsed, setCollapsed] = useState(startCollapsed);
    const [paused, setPaused] = useState(false);

    const [latHover, setLatHover] = useState<number | null>(null);
    const [rpsHover, setRpsHover] = useState<number | null>(null);
    const [loopHover, setLoopHover] = useState<number | null>(null);

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
            if (!alive) return;
            if (paused) return;
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
        if (!m) return { label: "unknown", color: "default" as const };
        return m.errors1m > 0 || m.owErrors1m > 0 ? { label: "degraded", color: "warning" as const } : { label: "ok", color: "success" as const };
    }, [m]);

    const updatedLabel = useMemo(() => {
        if (!m) return "Updated —";
        return `Updated ${formatAgo(m.updatedAt)}`;
    }, [m]);

    const trendLatency = useMemo(() => (m ? trendLabel(m.latencySeries ?? []) : "flat"), [m]);
    const trendRps = useMemo(() => (m ? trendLabel(m.rpsSeries ?? []) : "flat"), [m]);
    const trendLoop = useMemo(() => (m ? trendLabel(m.eventLoopLagSeries ?? []) : "flat"), [m]);

    const topStatuses = useMemo(() => (m ? topN(m.statusCounts, topNStatuses) : []), [m, topNStatuses]);
    const topOwStatuses = useMemo(() => (m ? topN(m.openWeatherStatusCounts, topNStatuses) : []), [m, topNStatuses]);

    const chipSx = {
        maxWidth: 180,
        "& .MuiChip-label": {
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontWeight: 900,
            textAlign: "center",
        },
    };

    if (!m && !error) {
        return (
            <Typography variant="body2" color="text.secondary">
                Loading…
            </Typography>
        );
    }

    return (
        <Stack spacing={1.6} sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center" useFlexGap sx={{ minWidth: 0 }}>
                <Chip size="small" label={health.label} color={health.color} variant="outlined" sx={chipSx} />
                {m && (
                    <>
                        <Chip size="small" label={`hit1m ${(m.cacheHitRate1m * 100).toFixed(0)}%`} color="primary" variant="outlined" sx={chipSx} />
                        <Chip size="small" label={`rps ${m.rps1m}`} variant="outlined" sx={chipSx} />
                        <Chip size="small" label={`p95 ${m.p95LatencyMs}ms`} variant="outlined" sx={chipSx} />
                        <Chip size="small" label={`loop p95 ${m.eventLoopLagP95Ms}ms`} variant="outlined" sx={chipSx} />
                    </>
                )}
                {m && showUpdatedChip && <Chip size="small" label={updatedLabel} color="primary" variant="outlined" sx={{ ...chipSx, maxWidth: 260 }} />}

                <Box sx={{ flex: 1 }} />

                <Button size="small" variant="outlined" color="primary" onClick={refresh} sx={{ height: 30, px: 1.2, whiteSpace: "nowrap" }}>
                    Refresh
                </Button>

                <Button
                    size="small"
                    variant="outlined"
                    color={paused ? "warning" : "primary"}
                    onClick={() => setPaused((x) => !x)}
                    sx={{ height: 30, px: 1.2, whiteSpace: "nowrap" }}
                >
                    {paused ? "Resume" : "Pause"}
                </Button>

                <Button size="small" variant="outlined" color="primary" onClick={() => setCollapsed((x) => !x)} sx={{ height: 30, px: 1.2, whiteSpace: "nowrap" }}>
                    {collapsed ? "Expand" : "Collapse"}
                </Button>
            </Stack>

            {error && (
                <Box
                    sx={{
                        p: 1.1,
                        borderRadius: 14,
                        border: "1px solid rgba(255, 80, 80, 0.22)",
                        background: "rgba(60, 14, 14, 0.35)",
                    }}
                >
                    <Typography variant="body2" sx={{ fontWeight: 900 }}>
                        {error}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        Metrics are unavailable. Try refresh.
                    </Typography>
                </Box>
            )}

            <Collapse in={!!m && !collapsed} timeout={180} unmountOnExit>
                {m && (
                    <Stack spacing={1.6} sx={{ minWidth: 0 }}>
                        <Box
                            sx={{
                                display: "grid",
                                gap: 1.2,
                                gridTemplateColumns: {
                                    xs: "repeat(2, minmax(0, 1fr))",
                                    sm: "repeat(3, minmax(0, 1fr))",
                                    md: "repeat(4, minmax(0, 1fr))",
                                },
                                minWidth: 0,
                            }}
                        >
                            <StatCell label="Uptime" value={formatUptime(m.uptimeSec)} emphasize />
                            <StatCell label="Node" value={m.node} />
                            <StatCell label="Req (1m)" value={m.req1m} />
                            <StatCell label="Errors (1m)" value={m.errors1m} />

                            <StatCell label="Latency last/avg" value={`${m.lastLatencyMs}/${m.avgLatencyMs} ms`} />
                            <StatCell label="Latency p50/p95" value={`${m.p50LatencyMs}/${m.p95LatencyMs} ms`} />
                            <StatCell label="OW calls/errors" value={`${m.openWeatherCalls}/${m.openWeatherErrors}`} />
                            <StatCell label="OW errors (1m)" value={m.owErrors1m} />

                            <StatCell label="Cache size" value={m.cacheSize} />
                            <StatCell label="Cache hit1m" value={`${m.cacheHits1m}/${m.cacheMisses1m}`} />
                            <StatCell label="Memory RSS" value={`${m.memoryMB.rss} MB`} />
                            <StatCell label="Heap used/total" value={`${m.memoryMB.heapUsed}/${m.memoryMB.heapTotal} MB`} />
                        </Box>

                        {showSparklines && (
                            <>
                                <Divider />

                                <Box
                                    sx={{
                                        display: "grid",
                                        gap: 2,
                                        gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                                        minWidth: 0,
                                    }}
                                >
                                    <Box sx={{ minWidth: 0 }}>
                                        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12, fontWeight: 900 }}>
                                                Latency trend {trendLatency}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12, fontWeight: 900 }}>
                                                {latHover == null ? "" : `${Math.round(latHover)} ms`}
                                            </Typography>
                                        </Stack>
                                        <Sparkline values={m.latencySeries ?? []} onHover={(v) => setLatHover(v)} formatValue={(v) => `${Math.round(v)} ms`} />
                                    </Box>

                                    <Box sx={{ minWidth: 0 }}>
                                        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12, fontWeight: 900 }}>
                                                RPS trend {trendRps}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12, fontWeight: 900 }}>
                                                {rpsHover == null ? "" : `${rpsHover.toFixed(2)}`}
                                            </Typography>
                                        </Stack>
                                        <Sparkline values={m.rpsSeries ?? []} onHover={(v) => setRpsHover(v)} formatValue={(v) => v.toFixed(2)} />
                                    </Box>

                                    <Box sx={{ minWidth: 0 }}>
                                        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12, fontWeight: 900 }}>
                                                Event loop lag trend {trendLoop}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 12, fontWeight: 900 }}>
                                                {loopHover == null ? "" : `${Math.round(loopHover)} ms`}
                                            </Typography>
                                        </Stack>
                                        <Sparkline values={m.eventLoopLagSeries ?? []} onHover={(v) => setLoopHover(v)} formatValue={(v) => `${Math.round(v)} ms`} />
                                    </Box>
                                </Box>
                            </>
                        )}

                        <Divider />

                        <Box
                            sx={{
                                display: "grid",
                                gap: 1.6,
                                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                                minWidth: 0,
                            }}
                        >
                            <Box sx={{ minWidth: 0 }}>
                                <Typography variant="subtitle2" fontWeight={950}>
                                    Top routes
                                </Typography>
                                <Stack spacing={0.7} sx={{ mt: 0.8 }}>
                                    {(m.topRoutes ?? []).slice(0, topNRoutes).map((r) => (
                                        <Box key={r.route} display="flex" justifyContent="space-between" gap={2} sx={{ minWidth: 0 }}>
                                            <Typography
                                                variant="body2"
                                                sx={{
                                                    opacity: 0.92,
                                                    minWidth: 0,
                                                    flex: 1,
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis",
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                {r.route}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 900, whiteSpace: "nowrap" }}>
                                                {r.count}
                                            </Typography>
                                        </Box>
                                    ))}
                                </Stack>
                            </Box>

                            <Box sx={{ minWidth: 0 }}>
                                <Typography variant="subtitle2" fontWeight={950}>
                                    Status codes
                                </Typography>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 0.8 }} useFlexGap>
                                    {topStatuses.map((x) => (
                                        <Chip key={x.k} size="small" label={`${x.k}: ${x.v}`} variant="outlined" sx={{ maxWidth: 160 }} />
                                    ))}
                                </Stack>

                                <Typography variant="subtitle2" fontWeight={950} sx={{ mt: 1.6 }}>
                                    OpenWeather status
                                </Typography>
                                <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mt: 0.8 }} useFlexGap>
                                    {topOwStatuses.map((x) => (
                                        <Chip key={x.k} size="small" label={`${x.k}: ${x.v}`} variant="outlined" sx={{ maxWidth: 160 }} />
                                    ))}
                                </Stack>
                            </Box>
                        </Box>
                    </Stack>
                )}
            </Collapse>
        </Stack>
    );
}

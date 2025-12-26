type Incident = {
    ts: number;
    path: string;
    status: number;
    message: string;
};

function clamp(n: number, a: number, b: number) {
    return Math.max(a, Math.min(b, n));
}

export class Metrics {
    startedAt = Date.now();
    node = process.env.NODE_NAME || "api";

    requestsTotal = 0;
    errorsTotal = 0;

    openWeatherCalls = 0;
    openWeatherErrors = 0;

    lastLatencyMs = 0;
    avgLatencyMs = 0;
    p50LatencyMs = 0;
    p95LatencyMs = 0;

    cacheSize = 0;
    cacheHits = 0;
    cacheMisses = 0;

    private req1m = 0;
    private err1m = 0;
    private owErr1m = 0;
    private cacheHits1m = 0;
    private cacheMisses1m = 0;

    latencySeries: number[] = [];
    rpsSeries: number[] = [];
    eventLoopLagSeries: number[] = [];

    eventLoopLagLastMs = 0;
    eventLoopLagAvgMs = 0;
    eventLoopLagP95Ms = 0;
    private loopLagWindow: number[] = [];

    topRoutes = new Map<string, number>();
    statusCounts = new Map<string, number>();
    openWeatherStatusCounts = new Map<string, number>();

    incidents: Incident[] = [];

    private latencyWindow: number[] = [];
    private tickStarted = Date.now();

    constructor() {
        setInterval(() => {
            const now = Date.now();
            const dtSec = (now - this.tickStarted) / 1000;
            this.tickStarted = now;

            const rps = dtSec > 0 ? this.req1m / dtSec : 0;
            this.rpsSeries.push(rps);
            this.latencySeries.push(this.p50LatencyMs || this.avgLatencyMs || 0);

            this.trimSeries();

            this.eventLoopLagSeries.push(this.eventLoopLagLastMs);
            this.trimSeries();
        }, 5000);

        setInterval(() => {
            this.req1m = 0;
            this.err1m = 0;
            this.owErr1m = 0;
            this.cacheHits1m = 0;
            this.cacheMisses1m = 0;
        }, 60_000);

        // event loop lag drift measurement
        let last = Date.now();
        setInterval(() => {
            const now = Date.now();
            const drift = Math.max(0, now - last - 1000);
            last = now;
            this.recordLoopLag(drift);
        }, 1000);
    }

    private trimSeries() {
        const max = 120; // ~10 min if pushed every 5s
        if (this.latencySeries.length > max) this.latencySeries.splice(0, this.latencySeries.length - max);
        if (this.rpsSeries.length > max) this.rpsSeries.splice(0, this.rpsSeries.length - max);
        if (this.eventLoopLagSeries.length > max) this.eventLoopLagSeries.splice(0, this.eventLoopLagSeries.length - max);
    }

    recordRequest(path: string) {
        this.requestsTotal++;
        this.req1m++;
        this.topRoutes.set(path, (this.topRoutes.get(path) ?? 0) + 1);
    }

    recordResponse(status: number) {
        this.statusCounts.set(String(status), (this.statusCounts.get(String(status)) ?? 0) + 1);
        if (status >= 400) {
            this.errorsTotal++;
            this.err1m++;
        }
    }

    recordOpenWeather(status: number) {
        this.openWeatherCalls++;
        this.openWeatherStatusCounts.set(String(status), (this.openWeatherStatusCounts.get(String(status)) ?? 0) + 1);
        if (status >= 400) {
            this.openWeatherErrors++;
            this.owErr1m++;
        }
    }

    recordCache(hit: boolean) {
        if (hit) {
            this.cacheHits++;
            this.cacheHits1m++;
        } else {
            this.cacheMisses++;
            this.cacheMisses1m++;
        }
    }

    recordLatency(ms: number) {
        this.lastLatencyMs = ms;
        this.latencyWindow.push(ms);
        if (this.latencyWindow.length > 200) this.latencyWindow.splice(0, this.latencyWindow.length - 200);

        const sorted = [...this.latencyWindow].sort((a, b) => a - b);
        const mean = sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length);
        this.avgLatencyMs = Math.round(mean);
        this.p50LatencyMs = Math.round(sorted[Math.floor(sorted.length * 0.5)] ?? 0);
        this.p95LatencyMs = Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0);
    }

    recordLoopLag(ms: number) {
        this.eventLoopLagLastMs = Math.round(ms);
        this.loopLagWindow.push(ms);
        if (this.loopLagWindow.length > 200) this.loopLagWindow.splice(0, this.loopLagWindow.length - 200);

        const sorted = [...this.loopLagWindow].sort((a, b) => a - b);
        const mean = sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length);
        this.eventLoopLagAvgMs = Math.round(mean);
        this.eventLoopLagP95Ms = Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0);
    }

    pushIncident(inc: Incident) {
        this.incidents.unshift(inc);
        if (this.incidents.length > 80) this.incidents.length = 80;
    }

    snapshot(cacheSize: number) {
        this.cacheSize = cacheSize;

        const uptimeSec = Math.floor((Date.now() - this.startedAt) / 1000);

        const toObj = (m: Map<string, number>) => Object.fromEntries([...m.entries()]);
        const topRoutes = [...this.topRoutes.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([route, count]) => ({ route, count }));

        const cacheHitRate = (this.cacheHits + this.cacheMisses) > 0 ? this.cacheHits / (this.cacheHits + this.cacheMisses) : 0;
        const cacheHitRate1m = (this.cacheHits1m + this.cacheMisses1m) > 0 ? this.cacheHits1m / (this.cacheHits1m + this.cacheMisses1m) : 0;

        return {
            uptimeSec,
            node: this.node,
            updatedAt: new Date().toISOString(),

            requestsTotal: this.requestsTotal,
            errorsTotal: this.errorsTotal,

            req1m: this.req1m,
            rps1m: Number((this.req1m / 60).toFixed(2)),
            errors1m: this.err1m,

            openWeatherCalls: this.openWeatherCalls,
            openWeatherErrors: this.openWeatherErrors,
            owErrors1m: this.owErr1m,

            lastLatencyMs: this.lastLatencyMs,
            avgLatencyMs: this.avgLatencyMs,
            p50LatencyMs: this.p50LatencyMs,
            p95LatencyMs: this.p95LatencyMs,

            cacheSize: this.cacheSize,
            cacheHits: this.cacheHits,
            cacheMisses: this.cacheMisses,
            cacheHitRate,
            cacheHits1m: this.cacheHits1m,
            cacheMisses1m: this.cacheMisses1m,
            cacheHitRate1m,

            latencySeries: this.latencySeries,
            rpsSeries: this.rpsSeries,
            eventLoopLagSeries: this.eventLoopLagSeries,
            eventLoopLagLastMs: this.eventLoopLagLastMs,
            eventLoopLagAvgMs: this.eventLoopLagAvgMs,
            eventLoopLagP95Ms: this.eventLoopLagP95Ms,

            topRoutes,
            statusCounts: toObj(this.statusCounts),
            openWeatherStatusCounts: toObj(this.openWeatherStatusCounts),

            memoryMB: {
                rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
                heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                external: Math.round(process.memoryUsage().external / 1024 / 1024),
            },
        };
    }
}

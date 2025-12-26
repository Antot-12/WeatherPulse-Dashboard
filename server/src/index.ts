import express from "express";
import cors from "cors";
import "dotenv/config";

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = process.env.OPENWEATHER_API_KEY;
if (!API_KEY) throw new Error("Missing OPENWEATHER_API_KEY in server/.env");

type CacheState = "fresh" | "stale";
type CacheEntry = { expires: number; staleUntil: number; data: any; savedAt: number };
const cache = new Map<string, CacheEntry>();

function getFromCache(key: string): { state: CacheState; data: any } | null {
  const hit = cache.get(key);
  if (!hit) return null;

  const now = Date.now();
  if (now <= hit.expires) return { state: "fresh", data: hit.data };

  if (now <= hit.staleUntil) return { state: "stale", data: hit.data };

  cache.delete(key);
  return null;
}

function setCache(key: string, data: any, ttlMs: number, staleMs: number) {
  const now = Date.now();
  cache.set(key, { data, expires: now + ttlMs, staleUntil: now + ttlMs + staleMs, savedAt: now });
}

function pushBounded<T>(arr: T[], v: T, maxLen: number) {
  arr.push(v);
  if (arr.length > maxLen) arr.splice(0, arr.length - maxLen);
}

function pruneOlderThan(arr: number[], msAgo: number) {
  const cutoff = Date.now() - msAgo;
  while (arr.length) {
    const first = arr[0];
    if (first == null) break;
    if (first < cutoff) arr.shift();
    else break;
  }
}

function percentile(arr: number[], p: number) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const idx = Math.floor((p / 100) * (a.length - 1));
  const clamped = Math.max(0, Math.min(a.length - 1, idx));
  return a[clamped] ?? 0;
}

function clampInt(n: number, a: number, b: number) {
  if (!Number.isFinite(n)) return a;
  return Math.max(a, Math.min(b, Math.floor(n)));
}

type Incident = {
  ts: string;
  route: string;
  kind: "server" | "openweather";
  message: string;
  status?: number;
};
const incidents: Incident[] = [];

function recordIncident(i: Incident) {
  pushBounded(incidents, i, 250);
}

const startedAt = Date.now();

const routeCounts: Record<string, number> = {};
const statusCounts: Record<string, number> = {};
const openWeatherStatusCounts: Record<string, number> = {};

const requestTimestamps: number[] = [];
const errorTimestamps: number[] = [];
const owErrorTimestamps: number[] = [];
const cacheHitTimestamps: number[] = [];
const cacheMissTimestamps: number[] = [];

const latencySamples: number[] = [];
const rpsSamples: number[] = [];
const eventLoopLagSeries: number[] = [];

let lastRequestAt: string | null = null;
let lastOpenWeatherAt: string | null = null;

const totals = {
  requestsTotal: 0,
  errorsTotal: 0,
  cacheHits: 0,
  cacheMisses: 0,
  openWeatherCalls: 0,
  openWeatherErrors: 0,
  lastLatencyMs: 0,
  avgLatencyMs: 0,
};

function recordRequest(routeKey: string, status: number) {
  totals.requestsTotal++;
  routeCounts[routeKey] = (routeCounts[routeKey] ?? 0) + 1;
  statusCounts[String(status)] = (statusCounts[String(status)] ?? 0) + 1;
  lastRequestAt = new Date().toISOString();

  requestTimestamps.push(Date.now());
  pruneOlderThan(requestTimestamps, 60_000);

  if (status >= 400) {
    totals.errorsTotal++;
    errorTimestamps.push(Date.now());
    pruneOlderThan(errorTimestamps, 60_000);
  }
}

const inflight = new Map<string, Promise<any>>();

async function timedFetchJson(url: string, timeoutMs: number) {
  totals.openWeatherCalls++;
  lastOpenWeatherAt = new Date().toISOString();

  const t0 = Date.now();
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), Math.max(1, Math.floor(timeoutMs)));

  try {
    const res = await fetch(url, { signal: ac.signal });
    const latency = Date.now() - t0;

    totals.lastLatencyMs = latency;
    totals.avgLatencyMs = totals.avgLatencyMs === 0 ? latency : Math.round(totals.avgLatencyMs * 0.9 + latency * 0.1);
    pushBounded(latencySamples, latency, 500);

    openWeatherStatusCounts[String(res.status)] = (openWeatherStatusCounts[String(res.status)] ?? 0) + 1;

    if (!res.ok) {
      totals.openWeatherErrors++;
      owErrorTimestamps.push(Date.now());
      pruneOlderThan(owErrorTimestamps, 60_000);

      const text = await res.text().catch(() => "");
      recordIncident({
        ts: new Date().toISOString(),
        route: "OpenWeather",
        kind: "openweather",
        status: res.status,
        message: text ? `OpenWeather error ${res.status}: ${text}` : `OpenWeather error ${res.status}`,
      });
      throw new Error(text ? `OpenWeather error ${res.status}: ${text}` : `OpenWeather error ${res.status}`);
    }

    try {
      return await res.json();
    } catch {
      return null;
    }
  } catch (e: unknown) {
    totals.openWeatherErrors++;
    owErrorTimestamps.push(Date.now());
    pruneOlderThan(owErrorTimestamps, 60_000);

    const msg = e instanceof Error ? e.message : "OpenWeather fetch failed";
    recordIncident({ ts: new Date().toISOString(), route: "OpenWeather", kind: "openweather", message: msg });
    throw e instanceof Error ? e : new Error(msg);
  } finally {
    clearTimeout(t);
  }
}

async function fetchJsonDedupe(key: string, url: string, timeoutMs: number) {
  const existing = inflight.get(key);
  if (existing) return existing;

  const p = (async () => {
    try {
      return await timedFetchJson(url, timeoutMs);
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p;
}

function withLatLon(req: express.Request) {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

setInterval(() => {
  pruneOlderThan(requestTimestamps, 60_000);
  const rpsNow = requestTimestamps.length / 60;
  pushBounded(rpsSamples, +rpsNow.toFixed(3), 240);
}, 2000);

let expected = Date.now() + 1000;
setInterval(() => {
  const now = Date.now();
  const lag = Math.max(0, now - expected);
  expected = now + 1000;
  pushBounded(eventLoopLagSeries, lag, 240);
}, 1000);

app.get("/api/geocode", async (req, res) => {
  const routeKey = "GET /api/geocode";
  try {
    const q = String(req.query.q ?? "").trim();
    const limit = clampInt(Number(req.query.limit ?? 5), 1, 10);

    if (!q) {
      recordRequest(routeKey, 400);
      return res.status(400).json({ error: "Missing q" });
    }

    const key = `geocode:${q}:${limit}`;
    const hit = getFromCache(key);

    if (hit) {
      totals.cacheHits++;
      cacheHitTimestamps.push(Date.now());
      pruneOlderThan(cacheHitTimestamps, 60_000);
      recordRequest(routeKey, 200);
      res.setHeader("x-cache", hit.state === "fresh" ? "HIT" : "STALE");
      if (hit.state === "stale") {
        const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=${limit}&appid=${API_KEY}`;
        void fetchJsonDedupe(`reval:${key}`, url, 9000)
            .then((data) => setCache(key, data, 10 * 60 * 1000, 20 * 60 * 1000))
            .catch(() => {});
      }
      return res.json({ source: hit.state, data: hit.data });
    }

    totals.cacheMisses++;
    cacheMissTimestamps.push(Date.now());
    pruneOlderThan(cacheMissTimestamps, 60_000);

    const url = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=${limit}&appid=${API_KEY}`;

    const data = await fetchJsonDedupe(key, url, 9000);
    setCache(key, data, 10 * 60 * 1000, 20 * 60 * 1000);

    recordRequest(routeKey, 200);
    res.setHeader("x-cache", "MISS");
    res.json({ source: "live", data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    recordIncident({ ts: new Date().toISOString(), route: routeKey, kind: "server", message: msg });
    recordRequest(routeKey, 500);
    res.status(500).json({ error: msg });
  }
});

app.get("/api/weather/current", async (req, res) => {
  const routeKey = "GET /api/weather/current";
  try {
    const ll = withLatLon(req);
    const units = String(req.query.units ?? "metric");

    if (!ll) {
      recordRequest(routeKey, 400);
      return res.status(400).json({ error: "Invalid lat/lon" });
    }

    const lat = ll.lat;
    const lon = ll.lon;

    const key = `current:${lat}:${lon}:${units}`;
    const hit = getFromCache(key);

    if (hit) {
      totals.cacheHits++;
      cacheHitTimestamps.push(Date.now());
      pruneOlderThan(cacheHitTimestamps, 60_000);
      recordRequest(routeKey, 200);
      res.setHeader("x-cache", hit.state === "fresh" ? "HIT" : "STALE");
      if (hit.state === "stale") {
        const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${API_KEY}`;
        void fetchJsonDedupe(`reval:${key}`, url, 9000)
            .then((data) => setCache(key, data, 2 * 60 * 1000, 10 * 60 * 1000))
            .catch(() => {});
      }
      return res.json({ source: hit.state, data: hit.data });
    }

    totals.cacheMisses++;
    cacheMissTimestamps.push(Date.now());
    pruneOlderThan(cacheMissTimestamps, 60_000);

    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${API_KEY}`;

    const data = await fetchJsonDedupe(key, url, 9000);
    setCache(key, data, 2 * 60 * 1000, 10 * 60 * 1000);

    recordRequest(routeKey, 200);
    res.setHeader("x-cache", "MISS");
    res.json({ source: "live", data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    recordIncident({ ts: new Date().toISOString(), route: routeKey, kind: "server", message: msg });
    recordRequest(routeKey, 500);
    res.status(500).json({ error: msg });
  }
});

app.get("/api/weather/forecast", async (req, res) => {
  const routeKey = "GET /api/weather/forecast";
  try {
    const ll = withLatLon(req);
    const units = String(req.query.units ?? "metric");

    if (!ll) {
      recordRequest(routeKey, 400);
      return res.status(400).json({ error: "Invalid lat/lon" });
    }

    const lat = ll.lat;
    const lon = ll.lon;

    const key = `forecast:${lat}:${lon}:${units}`;
    const hit = getFromCache(key);

    if (hit) {
      totals.cacheHits++;
      cacheHitTimestamps.push(Date.now());
      pruneOlderThan(cacheHitTimestamps, 60_000);
      recordRequest(routeKey, 200);
      res.setHeader("x-cache", hit.state === "fresh" ? "HIT" : "STALE");
      if (hit.state === "stale") {
        const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${units}&appid=${API_KEY}`;
        void fetchJsonDedupe(`reval:${key}`, url, 12_000)
            .then((data) => setCache(key, data, 5 * 60 * 1000, 20 * 60 * 1000))
            .catch(() => {});
      }
      return res.json({ source: hit.state, data: hit.data });
    }

    totals.cacheMisses++;
    cacheMissTimestamps.push(Date.now());
    pruneOlderThan(cacheMissTimestamps, 60_000);

    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${units}&appid=${API_KEY}`;

    const data = await fetchJsonDedupe(key, url, 12_000);
    setCache(key, data, 5 * 60 * 1000, 20 * 60 * 1000);

    recordRequest(routeKey, 200);
    res.setHeader("x-cache", "MISS");
    res.json({ source: "live", data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    recordIncident({ ts: new Date().toISOString(), route: routeKey, kind: "server", message: msg });
    recordRequest(routeKey, 500);
    res.status(500).json({ error: msg });
  }
});

app.get("/api/weather/onecall", async (req, res) => {
  const routeKey = "GET /api/weather/onecall";
  try {
    const ll = withLatLon(req);
    const units = String(req.query.units ?? "metric");
    const exclude = String(req.query.exclude ?? "");

    if (!ll) {
      recordRequest(routeKey, 400);
      return res.status(400).json({ error: "Invalid lat/lon" });
    }

    const lat = ll.lat;
    const lon = ll.lon;

    const key = `onecall:${lat}:${lon}:${units}:${exclude}`;
    const hit = getFromCache(key);

    if (hit) {
      totals.cacheHits++;
      cacheHitTimestamps.push(Date.now());
      pruneOlderThan(cacheHitTimestamps, 60_000);
      recordRequest(routeKey, 200);
      res.setHeader("x-cache", hit.state === "fresh" ? "HIT" : "STALE");
      if (hit.state === "stale") {
        const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&units=${units}${
            exclude ? `&exclude=${encodeURIComponent(exclude)}` : ""
        }&appid=${API_KEY}`;
        void fetchJsonDedupe(`reval:${key}`, url, 12_000)
            .then((data) => setCache(key, data, 10 * 60 * 1000, 30 * 60 * 1000))
            .catch(() => {});
      }
      return res.json({ source: hit.state, data: hit.data });
    }

    totals.cacheMisses++;
    cacheMissTimestamps.push(Date.now());
    pruneOlderThan(cacheMissTimestamps, 60_000);

    const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&units=${units}${
        exclude ? `&exclude=${encodeURIComponent(exclude)}` : ""
    }&appid=${API_KEY}`;

    const data = await fetchJsonDedupe(key, url, 12_000);
    setCache(key, data, 10 * 60 * 1000, 30 * 60 * 1000);

    recordRequest(routeKey, 200);
    res.setHeader("x-cache", "MISS");
    res.json({ source: "live", data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    recordIncident({ ts: new Date().toISOString(), route: routeKey, kind: "server", message: msg });
    recordRequest(routeKey, 500);
    res.status(500).json({ error: msg });
  }
});

app.get("/api/air/aqi", async (req, res) => {
  const routeKey = "GET /api/air/aqi";
  try {
    const ll = withLatLon(req);
    if (!ll) {
      recordRequest(routeKey, 400);
      return res.status(400).json({ error: "Invalid lat/lon" });
    }

    const lat = ll.lat;
    const lon = ll.lon;

    const key = `aqi:${lat}:${lon}`;
    const hit = getFromCache(key);

    if (hit) {
      totals.cacheHits++;
      cacheHitTimestamps.push(Date.now());
      pruneOlderThan(cacheHitTimestamps, 60_000);
      recordRequest(routeKey, 200);
      res.setHeader("x-cache", hit.state === "fresh" ? "HIT" : "STALE");
      if (hit.state === "stale") {
        const url = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`;
        void fetchJsonDedupe(`reval:${key}`, url, 10_000)
            .then((data) => setCache(key, data, 10 * 60 * 1000, 30 * 60 * 1000))
            .catch(() => {});
      }
      return res.json({ source: hit.state, data: hit.data });
    }

    totals.cacheMisses++;
    cacheMissTimestamps.push(Date.now());
    pruneOlderThan(cacheMissTimestamps, 60_000);

    const url = `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${API_KEY}`;

    const data = await fetchJsonDedupe(key, url, 10_000);
    setCache(key, data, 10 * 60 * 1000, 30 * 60 * 1000);

    recordRequest(routeKey, 200);
    res.setHeader("x-cache", "MISS");
    res.json({ source: "live", data });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Server error";
    recordIncident({ ts: new Date().toISOString(), route: routeKey, kind: "server", message: msg });
    recordRequest(routeKey, 500);
    res.status(500).json({ error: msg });
  }
});

app.get("/api/incidents", (req, res) => {
  const routeKey = "GET /api/incidents";
  const limit = clampInt(Number(req.query.limit ?? 50), 1, 250);
  recordRequest(routeKey, 200);
  const out = incidents.slice(Math.max(0, incidents.length - limit));
  res.json({ items: out });
});

app.get("/api/metrics", (req, res) => {
  pruneOlderThan(requestTimestamps, 60_000);
  pruneOlderThan(errorTimestamps, 60_000);
  pruneOlderThan(owErrorTimestamps, 60_000);
  pruneOlderThan(cacheHitTimestamps, 60_000);
  pruneOlderThan(cacheMissTimestamps, 60_000);

  const uptimeSec = Math.floor((Date.now() - startedAt) / 1000);

  const req1m = requestTimestamps.length;
  const rps1m = +(req1m / 60).toFixed(3);

  const errors1m = errorTimestamps.length;
  const owErrors1m = owErrorTimestamps.length;

  const cacheHits1m = cacheHitTimestamps.length;
  const cacheMisses1m = cacheMissTimestamps.length;
  const cacheHitRate1m =
      cacheHits1m + cacheMisses1m ? +(cacheHits1m / (cacheHits1m + cacheMisses1m)).toFixed(3) : 0;

  const p50 = Math.round(percentile(latencySamples, 50));
  const p95 = Math.round(percentile(latencySamples, 95));

  const lagLast = eventLoopLagSeries.at(-1) ?? 0;
  const lagAvg = eventLoopLagSeries.length
      ? Math.round(eventLoopLagSeries.reduce((a, b) => a + b, 0) / eventLoopLagSeries.length)
      : 0;
  const lagP95 = Math.round(percentile(eventLoopLagSeries, 95));

  const mem = process.memoryUsage();
  const memoryMB = {
    rss: +(mem.rss / (1024 * 1024)).toFixed(1),
    heapUsed: +(mem.heapUsed / (1024 * 1024)).toFixed(1),
    heapTotal: +(mem.heapTotal / (1024 * 1024)).toFixed(1),
    external: +(mem.external / (1024 * 1024)).toFixed(1),
  };

  const topRoutes = Object.entries(routeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([route, count]) => ({ route, count }));

  const cacheHitRate =
      totals.cacheHits + totals.cacheMisses ? +(totals.cacheHits / (totals.cacheHits + totals.cacheMisses)).toFixed(3) : 0;

  let health = "green";
  if (errors1m > 0 || owErrors1m > 0) health = "yellow";
  if (errors1m >= 3 || owErrors1m >= 3) health = "red";
  if (p95 >= 2500) health = health === "red" ? "red" : "yellow";

  res.json({
    uptimeSec,
    node: process.version,
    updatedAt: new Date().toISOString(),
    lastRequestAt,
    lastOpenWeatherAt,

    health,

    requestsTotal: totals.requestsTotal,
    errorsTotal: totals.errorsTotal,

    openWeatherCalls: totals.openWeatherCalls,
    openWeatherErrors: totals.openWeatherErrors,

    lastLatencyMs: totals.lastLatencyMs,
    avgLatencyMs: totals.avgLatencyMs,
    p50LatencyMs: p50,
    p95LatencyMs: p95,

    req1m,
    rps1m,
    errors1m,
    owErrors1m,

    cacheSize: cache.size,
    cacheHits: totals.cacheHits,
    cacheMisses: totals.cacheMisses,
    cacheHitRate,
    cacheHits1m,
    cacheMisses1m,
    cacheHitRate1m,

    inflight: inflight.size,

    rpsSeries: rpsSamples,
    latencySeries: latencySamples.slice(-240),
    eventLoopLagSeries,
    eventLoopLagLastMs: lagLast,
    eventLoopLagAvgMs: lagAvg,
    eventLoopLagP95Ms: lagP95,

    topRoutes,
    statusCounts,
    openWeatherStatusCounts,
    memoryMB,
  });
});

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));

import type { GeoItem } from "./types";

type ApiOk<T> = { data: T };
type ApiErr = { error?: string; message?: string; details?: unknown };

type RequestOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  headers?: Record<string, string>;
  retryOn?: (err: unknown, res: Response | null) => boolean;
  backoff?: {
    baseDelayMs?: number;
    factor?: number;
    jitterRatio?: number;
    maxDelayMs?: number;
  };
};

const DEFAULTS: Required<Pick<RequestOptions, "timeoutMs" | "retries" | "retryDelayMs">> = {
  timeoutMs: 10_000,
  retries: 1,
  retryDelayMs: 350,
};

const DEFAULT_BACKOFF: Required<NonNullable<RequestOptions["backoff"]>> = {
  baseDelayMs: 350,
  factor: 1.6,
  jitterRatio: 0.2,
  maxDelayMs: 8000,
};

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function withJitter(ms: number, jitterRatio: number) {
  const j = Math.max(0, jitterRatio);
  const delta = ms * j;
  const lo = ms - delta;
  const hi = ms + delta;
  return Math.max(0, lo + Math.random() * (hi - lo));
}

function backoffDelay(attempt: number, baseDelayMs: number, factor: number, jitterRatio: number, maxDelayMs: number) {
  const raw = baseDelayMs * Math.pow(factor, Math.max(0, attempt));
  return Math.min(maxDelayMs, withJitter(raw, jitterRatio));
}

function joinSignals(a?: AbortSignal, b?: AbortSignal) {
  if (!a) return b;
  if (!b) return a;
  if (a.aborted) return a;
  if (b.aborted) return b;

  const c = new AbortController();
  const onAbort = () => c.abort();

  a.addEventListener("abort", onAbort, { once: true });
  b.addEventListener("abort", onAbort, { once: true });

  return c.signal;
}

function toErrorMessage(x: unknown) {
  if (x instanceof Error) return x.message;
  if (typeof x === "string") return x;
  return "Request failed";
}

function isApiOk<T>(json: unknown): json is ApiOk<T> {
  return !!json && typeof json === "object" && "data" in json;
}

function extractApiError(json: unknown) {
  const j = json as ApiErr | null;
  const msg = j?.error ?? j?.message;
  return typeof msg === "string" && msg.trim() ? msg : null;
}

async function parseJsonSafe(res: Response) {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isRetryableStatus(s: number) {
  return s === 408 || s === 425 || s === 429 || (s >= 500 && s <= 599);
}

function isAbortError(e: unknown) {
  return e instanceof DOMException && e.name === "AbortError";
}

type KeyParts = { method: string; url: string; headers?: Record<string, string> };
function reqKey(p: KeyParts) {
  const h = p.headers ? Object.entries(p.headers).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) : [];
  return `${p.method} ${p.url} ${JSON.stringify(h)}`;
}

const inflight = new Map<string, Promise<unknown>>();

async function requestJson<T>(url: string, opts?: RequestOptions): Promise<T> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULTS.timeoutMs;
  const retries = opts?.retries ?? DEFAULTS.retries;

  const backoff = {
    baseDelayMs: opts?.backoff?.baseDelayMs ?? opts?.retryDelayMs ?? DEFAULT_BACKOFF.baseDelayMs,
    factor: opts?.backoff?.factor ?? DEFAULT_BACKOFF.factor,
    jitterRatio: opts?.backoff?.jitterRatio ?? DEFAULT_BACKOFF.jitterRatio,
    maxDelayMs: opts?.backoff?.maxDelayMs ?? DEFAULT_BACKOFF.maxDelayMs,
  };

  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ac = new AbortController();
    const t = window.setTimeout(() => ac.abort(), timeoutMs);
    const signal = joinSignals(opts?.signal, ac.signal);

    let res: Response | null = null;

    try {
      res = await fetch(url, {
        method: "GET",
        signal,
        headers: {
          Accept: "application/json",
          ...(opts?.headers ?? {}),
        },
      });

      const json = await parseJsonSafe(res);

      if (!res.ok) {
        const apiMsg = extractApiError(json);
        const msg = apiMsg ?? `HTTP ${res.status}`;
        const retryable = isRetryableStatus(res.status);
        const shouldRetry = attempt < retries && (opts?.retryOn ? opts.retryOn(new Error(msg), res) : retryable);

        if (shouldRetry) {
          lastErr = new Error(msg);
          await sleep(backoffDelay(attempt, backoff.baseDelayMs, backoff.factor, backoff.jitterRatio, backoff.maxDelayMs));
          continue;
        }

        throw new Error(msg);
      }

      if (isApiOk<T>(json)) return json.data as T;
      return (json as T) ?? (null as unknown as T);
    } catch (e: unknown) {
      lastErr = e;
      const aborted = isAbortError(e);
      const shouldRetry = attempt < retries && !aborted && (opts?.retryOn ? opts.retryOn(e, res) : true);

      if (shouldRetry) {
        await sleep(backoffDelay(attempt, backoff.baseDelayMs, backoff.factor, backoff.jitterRatio, backoff.maxDelayMs));
        continue;
      }

      throw new Error(toErrorMessage(e));
    } finally {
      window.clearTimeout(t);
    }
  }

  throw new Error(toErrorMessage(lastErr));
}

async function requestJsonDedupe<T>(url: string, opts?: RequestOptions): Promise<T> {
  if (opts?.signal) return requestJson<T>(url, opts);

  const key = reqKey({ method: "GET", url, headers: opts?.headers });
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const p = requestJson<T>(url, opts).finally(() => {
    inflight.delete(key);
  });

  inflight.set(key, p as Promise<unknown>);
  return p;
}

function qs(params: Record<string, string | number | boolean | undefined>) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue;
    u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

export type GeocodeOptions = {
  limit?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export async function geocode(q: string, options?: GeocodeOptions): Promise<GeoItem[]> {
  const limit = options?.limit ?? 5;
  const url = `/api/geocode${qs({ q, limit })}`;
  return requestJsonDedupe<GeoItem[]>(url, {
    signal: options?.signal,
    timeoutMs: options?.timeoutMs,
    retries: 1,
    backoff: { baseDelayMs: 250, factor: 1.5, jitterRatio: 0.25, maxDelayMs: 1200 },
  });
}

export type Units = "metric" | "imperial";

export type WeatherOptions = {
  units?: Units;
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
};

export type CurrentWeather = {
  main: { temp: number; humidity: number };
  wind: { speed: number };
};

export type ForecastResponse = {
  list: Array<{
    dt: number;
    main: { temp: number; humidity: number };
    wind: { speed: number };
  }>;
};

export async function getCurrent(lat: number, lon: number, options?: WeatherOptions): Promise<CurrentWeather> {
  const units = options?.units ?? "metric";
  const url = `/api/weather/current${qs({ lat, lon, units })}`;
  return requestJsonDedupe<CurrentWeather>(url, {
    signal: options?.signal,
    timeoutMs: options?.timeoutMs,
    retries: options?.retries ?? 1,
    backoff: { baseDelayMs: 400, factor: 1.7, jitterRatio: 0.25, maxDelayMs: 3500 },
  });
}

export async function getForecast(lat: number, lon: number, options?: WeatherOptions): Promise<ForecastResponse> {
  const units = options?.units ?? "metric";
  const url = `/api/weather/forecast${qs({ lat, lon, units })}`;
  return requestJsonDedupe<ForecastResponse>(url, {
    signal: options?.signal,
    timeoutMs: options?.timeoutMs,
    retries: options?.retries ?? 1,
    backoff: { baseDelayMs: 500, factor: 1.7, jitterRatio: 0.25, maxDelayMs: 5000 },
  });
}

export type OneCallOptions = {
  units?: Units;
  exclude?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
};

export type OneCallResponse = unknown;

export async function getOneCall(lat: number, lon: number, options?: OneCallOptions): Promise<OneCallResponse> {
  const units = options?.units ?? "metric";
  const exclude = options?.exclude ?? "";
  const url = `/api/weather/onecall${qs({ lat, lon, units, exclude })}`;
  return requestJsonDedupe<OneCallResponse>(url, {
    signal: options?.signal,
    timeoutMs: options?.timeoutMs ?? 12_000,
    retries: options?.retries ?? 1,
    backoff: { baseDelayMs: 650, factor: 1.8, jitterRatio: 0.25, maxDelayMs: 7000 },
  });
}

export type AirAqiResponse = unknown;

export type AqiOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
};

export async function getAqi(lat: number, lon: number, options?: AqiOptions): Promise<AirAqiResponse> {
  const url = `/api/air/aqi${qs({ lat, lon })}`;
  return requestJsonDedupe<AirAqiResponse>(url, {
    signal: options?.signal,
    timeoutMs: options?.timeoutMs ?? 10_000,
    retries: options?.retries ?? 1,
    backoff: { baseDelayMs: 550, factor: 1.8, jitterRatio: 0.25, maxDelayMs: 7000 },
  });
}

export type Incident = {
  ts: string;
  route: string;
  kind: "server" | "openweather";
  message: string;
  status?: number;
};

export type IncidentsResponse = { items: Incident[] };

export type IncidentsOptions = {
  limit?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
};

export async function getIncidents(options?: IncidentsOptions): Promise<IncidentsResponse> {
  const limit = options?.limit ?? 50;
  const url = `/api/incidents${qs({ limit })}`;
  return requestJsonDedupe<IncidentsResponse>(url, {
    signal: options?.signal,
    timeoutMs: options?.timeoutMs ?? 8000,
    retries: options?.retries ?? 0,
  });
}

export type Metrics = {
  uptimeSec: number;
  node: string;
  updatedAt: string;

  health?: "green" | "yellow" | "red";

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

  inflight?: number;
};

export type MetricsOptions = {
  signal?: AbortSignal;
  timeoutMs?: number;
  retries?: number;
};

export async function getMetrics(options?: MetricsOptions): Promise<Metrics> {
  const url = `/api/metrics`;
  return requestJsonDedupe<Metrics>(url, {
    signal: options?.signal,
    timeoutMs: options?.timeoutMs,
    retries: options?.retries ?? 0,
  });
}

export function createAbortableRequest() {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    abort: () => controller.abort(),
  };
}

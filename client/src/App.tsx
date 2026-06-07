import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject, ReactNode } from "react";
import Container from "@mui/material/Container";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Autocomplete from "@mui/material/Autocomplete";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Snackbar from "@mui/material/Snackbar";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Collapse from "@mui/material/Collapse";

import LocationCityIcon from "@mui/icons-material/LocationCity";
import RefreshIcon from "@mui/icons-material/Refresh";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import PushPinIcon from "@mui/icons-material/PushPin";
import BookmarksIcon from "@mui/icons-material/Bookmarks";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import MyLocationIcon from "@mui/icons-material/MyLocation";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import NotificationsOffIcon from "@mui/icons-material/NotificationsOff";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme, keyframes } from "@mui/material/styles";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";

import type { Layout } from "react-grid-layout";
import { WeatherIcon } from "./components/WeatherIcon";
import { EmptyState, ChartPlaceholder } from "./components/EmptyStates";
import { WeatherSkeleton, ChartSkeleton } from "./components/Skeletons";
import { getTempColor, getTempGradient, getTempDescription, getWindColor } from "./utils/weatherColors";
import { geocode, getCurrent, getForecast, getBatchWeather, createAbortableRequest } from "./api";
import type { ForecastPoint, GeoItem } from "./types";
import { debounce } from "./utils/debounce";
import { GlowCard } from "./components/GlowCard";
import { TempLineChart } from "./components/TempLineChart";
import { HumidityChart } from "./components/HumidityChart";
import { WindChart } from "./components/WindChart";
import { MonitoringPanel } from "./components/MonitoringPanel";
import { ServerStatsPanel } from "./components/ServerStatsPanel";
import { GridDashboard } from "./components/GridDashboard";
import type { RGLLayouts } from "./components/GridDashboard";
import { WidgetCard } from "./components/WidgetCard";
import { TabbedWidgetCard } from "./components/TabbedWidgetCard";
import { CombinedChartWidget } from "./components/CombinedChartWidget";
import { loadLayouts, loadSelectedCity, saveLayouts, saveSelectedCity } from "./storage";

type Breakpoint = "xl" | "lg" | "md" | "sm" | "xs";
type LayoutItem = Layout[number];

type Pinned = { name: string; lat: number; lon: number; country: string; state?: string; group?: string };
const PIN_KEY = "weatherpulse:pins:v3";
const DEFAULT_PIN_KEY = "weatherpulse:pins:default:v1";

type CurrentWeather = {
  main: { temp: number; humidity: number; feels_like?: number; pressure?: number };
  wind: { speed: number; gust?: number };
  clouds?: { all?: number };
  visibility?: number;
  sys?: { sunrise?: number; sunset?: number };
  weather?: Array<{ id?: number; main?: string; description?: string; icon?: string }>;
};

// Keyframes for animations
const pulseRefresh = keyframes`
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(37, 243, 225, 0.4); }
  50% { opacity: 0.8; box-shadow: 0 0 0 8px rgba(37, 243, 225, 0); }
`;

type ForecastResponse = {
  list: Array<{
    dt: number;
    main: { temp: number; humidity: number };
    wind: { speed: number; gust?: number };
    pop?: number;
    rain?: { "3h"?: number };
    snow?: { "3h"?: number };
    clouds?: { all?: number };
  }>;
  city?: { sunrise?: number; sunset?: number };
};

type PinPreview = {
  ok: boolean;
  temp: number | null;
  wind: number | null;
  updatedAt: number;
  message?: string;
};

type AlertSeverity = "ok" | "warn" | "crit";
type AlertRuleKind = "wind_gt" | "temp_lt";
type AlertRule = { id: string; kind: AlertRuleKind; value: number; enabled: boolean; notify: boolean };
type AlertItem = { id: string; ts: number; city: string; message: string; severity: AlertSeverity };

const ALERT_RULES_KEY = "weatherpulse:alertRules:v1";
const ALERTS_KEY = "weatherpulse:alerts:v1";

const WIDGET_IDS = ["overview", "forecast", "humidity", "wind", "pins", "monitoring", "serverstats"] as const;

// Chart types that can be combined
const CHART_WIDGETS = ["forecast", "humidity", "wind"] as const;
type ChartType = typeof CHART_WIDGETS[number];

function loadPins(): Pinned[] {
  try {
    return JSON.parse(localStorage.getItem(PIN_KEY) ?? "[]") as Pinned[];
  } catch {
    return [];
  }
}

function savePins(p: Pinned[]) {
  localStorage.setItem(PIN_KEY, JSON.stringify(p));
}

function loadDefaultPin(): Pinned | null {
  try {
    return JSON.parse(localStorage.getItem(DEFAULT_PIN_KEY) ?? "null") as Pinned | null;
  } catch {
    return null;
  }
}

function saveDefaultPin(p: Pinned | null) {
  if (!p) localStorage.removeItem(DEFAULT_PIN_KEY);
  else localStorage.setItem(DEFAULT_PIN_KEY, JSON.stringify(p));
}

function pinnedToGeo(p: Pinned): GeoItem {
  return { name: p.name, lat: p.lat, lon: p.lon, country: p.country, state: p.state };
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function formatUpdated(ts: number | null) {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function pinKey(p: { lat: number; lon: number }) {
  const la = Math.round(p.lat * 10000) / 10000;
  const lo = Math.round(p.lon * 10000) / 10000;
  return `${la}:${lo}`;
}

function dayLengthLabel(sunriseSec?: number, sunsetSec?: number) {
  if (!sunriseSec || !sunsetSec) return "—";
  const d = Math.max(0, sunsetSec - sunriseSec);
  const h = Math.floor(d / 3600);
  const m = Math.floor((d % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function fmtClock(sec?: number) {
  if (!sec) return "—";
  const d = new Date(sec * 1000);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

// fmtShortTime - kept for potential use in forecast details
// function fmtShortTime(d: Date) {
//   const hh = String(d.getHours()).padStart(2, "0");
//   const mm = String(d.getMinutes()).padStart(2, "0");
//   const dd = String(d.getDate()).padStart(2, "0");
//   const mo = String(d.getMonth() + 1).padStart(2, "0");
//   return `${dd}.${mo} ${hh}:${mm}`;
// }

function safeNum(x: unknown) {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

function loadAlertRules(): AlertRule[] {
  try {
    const raw = JSON.parse(localStorage.getItem(ALERT_RULES_KEY) ?? "null") as unknown;
    if (!Array.isArray(raw)) throw new Error("bad");
    const out: AlertRule[] = [];
    for (const r of raw) {
      if (!r || typeof r !== "object") continue;
      const id = String((r as { id?: unknown }).id ?? "");
      const kind = String((r as { kind?: unknown }).kind ?? "") as AlertRuleKind;
      const value = safeNum((r as { value?: unknown }).value);
      const enabled = !!(r as { enabled?: unknown }).enabled;
      const notify = !!(r as { notify?: unknown }).notify;
      if (!id || (kind !== "wind_gt" && kind !== "temp_lt") || value == null) continue;
      out.push({ id, kind, value, enabled, notify });
    }
    if (!out.length) throw new Error("empty");
    return out;
  } catch {
    return [
      { id: "r1", kind: "wind_gt", value: 12, enabled: true, notify: false },
      { id: "r2", kind: "temp_lt", value: 0, enabled: true, notify: false },
    ];
  }
}

function loadAlerts(): AlertItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(ALERTS_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    const out: AlertItem[] = [];
    for (const a of raw) {
      if (!a || typeof a !== "object") continue;
      const id = String((a as { id?: unknown }).id ?? "");
      const ts = safeNum((a as { ts?: unknown }).ts);
      const city = String((a as { city?: unknown }).city ?? "");
      const message = String((a as { message?: unknown }).message ?? "");
      const severity = String((a as { severity?: unknown }).severity ?? "warn") as AlertSeverity;
      if (!id || ts == null || !city || !message) continue;
      if (severity !== "ok" && severity !== "warn" && severity !== "crit") continue;
      out.push({ id, ts, city, message, severity });
    }
    return out.slice(0, 200);
  } catch {
    return [];
  }
}

const DEFAULT_LAYOUTS: RGLLayouts = {
  xl: [
    { i: "overview", x: 0, y: 0, w: 4, h: 14 },
    { i: "monitoring", x: 4, y: 0, w: 4, h: 8 },
    { i: "humidity", x: 8, y: 0, w: 4, h: 12 },
    { i: "wind", x: 4, y: 8, w: 8, h: 10 },
    { i: "pins", x: 0, y: 14, w: 4, h: 9 },
    { i: "serverstats", x: 0, y: 23, w: 6, h: 12 },
    { i: "forecast", x: 6, y: 18, w: 6, h: 10 },
  ],
  lg: [
    { i: "overview", x: 0, y: 0, w: 4, h: 14 },
    { i: "monitoring", x: 4, y: 0, w: 4, h: 8 },
    { i: "humidity", x: 8, y: 0, w: 4, h: 12 },
    { i: "wind", x: 4, y: 8, w: 8, h: 10 },
    { i: "pins", x: 0, y: 14, w: 4, h: 9 },
    { i: "serverstats", x: 0, y: 23, w: 6, h: 12 },
    { i: "forecast", x: 6, y: 18, w: 6, h: 10 },
  ],
  md: [
    { i: "overview", x: 0, y: 0, w: 6, h: 12 },
    { i: "monitoring", x: 6, y: 0, w: 6, h: 8 },
    { i: "humidity", x: 0, y: 12, w: 6, h: 10 },
    { i: "wind", x: 6, y: 8, w: 6, h: 10 },
    { i: "pins", x: 0, y: 22, w: 6, h: 9 },
    { i: "serverstats", x: 0, y: 31, w: 6, h: 12 },
    { i: "forecast", x: 6, y: 18, w: 6, h: 10 },
  ],
  sm: [
    { i: "overview", x: 0, y: 0, w: 6, h: 10 },
    { i: "monitoring", x: 0, y: 10, w: 6, h: 8 },
    { i: "humidity", x: 0, y: 18, w: 6, h: 10 },
    { i: "wind", x: 0, y: 28, w: 6, h: 10 },
    { i: "pins", x: 0, y: 38, w: 6, h: 9 },
    { i: "serverstats", x: 0, y: 47, w: 6, h: 12 },
    { i: "forecast", x: 0, y: 59, w: 6, h: 10 },
  ],
  xs: [
    { i: "overview", x: 0, y: 0, w: 1, h: 10 },
    { i: "monitoring", x: 0, y: 10, w: 1, h: 8 },
    { i: "humidity", x: 0, y: 18, w: 1, h: 10 },
    { i: "wind", x: 0, y: 28, w: 1, h: 10 },
    { i: "pins", x: 0, y: 38, w: 1, h: 10 },
    { i: "serverstats", x: 0, y: 48, w: 1, h: 12 },
    { i: "forecast", x: 0, y: 60, w: 1, h: 10 },
  ],
};

function asMap(arr: Layout) {
  const m = new Map<string, LayoutItem>();
  for (const x of arr) m.set(x.i, x);
  return m;
}

const ALL_RESIZE_HANDLES: ("s" | "w" | "e" | "n" | "sw" | "nw" | "se" | "ne")[] = ['s', 'w', 'e', 'n', 'sw', 'nw', 'se', 'ne'];

function ensureLayouts(current: RGLLayouts | null, defaults: RGLLayouts, ids: string[]): RGLLayouts {
  const bps: Breakpoint[] = ["xl", "lg", "md", "sm", "xs"];
  const out: RGLLayouts = {};

  for (const bp of bps) {
    const base: Layout = (current?.[bp] ?? []) as Layout;
    const def: Layout = (defaults?.[bp] ?? []) as Layout;

    const baseMap = asMap(base);
    const defMap = asMap(def);

    const next: LayoutItem[] = [];
    for (const id of ids) {
      const existing = baseMap.get(id);
      if (existing) next.push({ ...existing, resizeHandles: ALL_RESIZE_HANDLES });
      else {
        const d = defMap.get(id);
        if (d) next.push({ ...d, resizeHandles: ALL_RESIZE_HANDLES });
        else next.push({ i: id, x: 0, y: 9999, w: 4, h: 8, resizeHandles: ALL_RESIZE_HANDLES });
      }
    }
    out[bp] = next;
  }

  return out;
}

export default function App() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  // const isTablet = useMediaQuery(theme.breakpoints.down("md"));

  const [mobileTab, setMobileTab] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const widgetIds = useMemo(() => [...WIDGET_IDS], []);
  const [q, setQ] = useState("Kyiv");
  const [options, setOptions] = useState<GeoItem[]>([]);
  const [selected, setSelected] = useState<GeoItem | null>(null);

  const [current, setCurrent] = useState<CurrentWeather | null>(null);
  const [forecastData, setForecastData] = useState<ForecastPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);

  const [pins, setPins] = useState<Pinned[]>(() => loadPins());
  const [defaultPin, setDefaultPin] = useState<Pinned | null>(() => loadDefaultPin());
  const [pinFilter, setPinFilter] = useState("");
  const [pinGroup, setPinGroup] = useState<string>("all");

  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Combined widgets state: { "monitoring": ["monitoring", "serverstats"] } means monitoring widget shows both as tabs
  const COMBINED_KEY = "weatherpulse:combined:v1";
  const [combinedWidgets, setCombinedWidgets] = useState<Record<string, string[]>>(() => {
    try {
      return JSON.parse(localStorage.getItem(COMBINED_KEY) ?? "{}") as Record<string, string[]>;
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem(COMBINED_KEY, JSON.stringify(combinedWidgets));
  }, [combinedWidgets]);

  const [layouts, setLayouts] = useState<RGLLayouts>(() =>
      ensureLayouts(loadLayouts() as RGLLayouts | null, DEFAULT_LAYOUTS, widgetIds)
  );

  const [rangeHours, setRangeHours] = useState<number>(120);
  const [step, setStep] = useState<number>(1);

  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [autoRefreshMin, setAutoRefreshMin] = useState<number>(5);

  const loadAbortRef = useRef<ReturnType<typeof createAbortableRequest> | null>(null);
  const geocodeAbortRef = useRef<ReturnType<typeof createAbortableRequest> | null>(null);
  const loadSeqRef = useRef(0);

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const inFlightKeyRef = useRef<string | null>(null);
  const lastSuccessKeyRef = useRef<string | null>(null);
  const lastSuccessAtRef = useRef<number>(0);

  const autoBackoffRef = useRef<number>(1);

  const [pinPreviews, setPinPreviews] = useState<Record<string, PinPreview>>({});

  const [alertRules, setAlertRules] = useState<AlertRule[]>(() => loadAlertRules());
  const [alerts, setAlerts] = useState<AlertItem[]>(() => loadAlerts());
  const [alertsOpen, setAlertsOpen] = useState(false);
  const lastAlertByKeyRef = useRef<Map<string, number>>(new Map());

  const title = selected
      ? `${selected.name}${selected.state ? `, ${selected.state}` : ""}, ${selected.country}`
      : "Select a city";

  const setInfoSafe = useCallback((m: string) => {
    setInfo(m);
  }, []);

  const addAlert = useCallback(
      async (args: { city: string; message: string; severity: AlertSeverity; notify: boolean }) => {
        const id = `${Date.now()}:${Math.random().toString(16).slice(2)}`;
        const item: AlertItem = { id, ts: Date.now(), city: args.city, message: args.message, severity: args.severity };
        setAlerts((prev) => [item, ...prev].slice(0, 200));
        setAlertsOpen(true);

        if (!args.notify) return;
        if (typeof Notification === "undefined") return;

        if (Notification.permission === "default") {
          try {
            await Notification.requestPermission();
          } catch {
            return;
          }
        }
        if (Notification.permission !== "granted") return;

        try {
          new Notification(`WeatherPulse alert: ${args.city}`, { body: args.message });
        } catch {
          return;
        }
      },
      []
  );

  const evaluateAlerts = useCallback(
      async (city: string, cur: CurrentWeather | null) => {
        if (!cur) return;

        const wind = safeNum(cur.wind?.speed);
        const temp = safeNum(cur.main?.temp);

        for (const r of alertRules) {
          if (!r.enabled) continue;

          const k = `${city}:${r.id}`;
          const last = lastAlertByKeyRef.current.get(k) ?? 0;
          const coolMs = 15 * 60_000;
          if (Date.now() - last < coolMs) continue;

          if (r.kind === "wind_gt" && wind != null && wind > r.value) {
            lastAlertByKeyRef.current.set(k, Date.now());
            await addAlert({
              city,
              message: `Wind ${wind.toFixed(1)} m/s > ${r.value.toFixed(1)} m/s`,
              severity: wind > r.value * 1.6 ? "crit" : "warn",
              notify: r.notify,
            });
          }

          if (r.kind === "temp_lt" && temp != null && temp < r.value) {
            lastAlertByKeyRef.current.set(k, Date.now());
            await addAlert({
              city,
              message: `Temp ${temp.toFixed(1)}°C < ${r.value.toFixed(1)}°C`,
              severity: temp < r.value - 10 ? "crit" : "warn",
              notify: r.notify,
            });
          }
        }
      },
      [addAlert, alertRules]
  );

  const loadWeather = useCallback(
      async (item: GeoItem, opts?: { silent?: boolean }) => {
        const silent = !!opts?.silent;

        const key = `${Math.round(item.lat * 10000) / 10000}:${Math.round(item.lon * 10000) / 10000}`;
        const now = Date.now();

        if (silent && lastSuccessKeyRef.current === key && now - lastSuccessAtRef.current < 25_000) return;
        if (inFlightKeyRef.current === key && loadAbortRef.current && !loadAbortRef.current.signal.aborted) return;

        inFlightKeyRef.current = key;

        loadAbortRef.current?.abort();
        const req = createAbortableRequest();
        loadAbortRef.current = req;

        const seq = ++loadSeqRef.current;

        setSelected(item);
        saveSelectedCity(item);

        // Set refreshing state for animation
        if (silent) {
          setIsRefreshing(true);
        }

        if (!silent) {
          setLoading(true);
          setError(null);
          setCurrent(null);
          setForecastData([]);
        }

        try {
          const curData = await getCurrent(item.lat, item.lon, { signal: req.signal, timeoutMs: 10_000, retries: 1 });
          if (req.signal.aborted || seq !== loadSeqRef.current) return;
          setCurrent(curData as unknown as CurrentWeather);

          const fcData = await getForecast(item.lat, item.lon, { signal: req.signal, timeoutMs: 12_000, retries: 1 });
          if (req.signal.aborted || seq !== loadSeqRef.current) return;

          const raw = fcData as unknown as ForecastResponse;
          const points: ForecastPoint[] = (raw.list ?? []).map((x) => ({
            dt: x.dt,
            date: new Date(x.dt * 1000),
            temp: x.main.temp,
            humidity: x.main.humidity,
            wind: x.wind.speed,
          }));

          setForecastData(points);
          setLastLoadedAt(Date.now());

          lastSuccessKeyRef.current = key;
          lastSuccessAtRef.current = Date.now();
          autoBackoffRef.current = 1;

          const cityLabel = `${item.name}${item.state ? `, ${item.state}` : ""}, ${item.country}`.trim();
          await evaluateAlerts(cityLabel, curData as unknown as CurrentWeather);
        } catch (e: unknown) {
          if (req.signal.aborted) return;
          const msg = e instanceof Error ? e.message : "Failed to load weather";
          if (!silent) setError(msg);
          else {
            setError((prev) => prev ?? msg);
            autoBackoffRef.current = Math.min(6, Math.max(1, autoBackoffRef.current * 1.8));
          }
        } finally {
          if (!silent) setLoading(false);
          setIsRefreshing(false);
          inFlightKeyRef.current = null;
        }
      },
      [evaluateAlerts]
  );

  const debouncedSearch = useMemo(
      () =>
          debounce(async (value: string) => {
            const v = value.trim();
            if (!v) {
              setOptions([]);
              return;
            }

            geocodeAbortRef.current?.abort();
            const req = createAbortableRequest();
            geocodeAbortRef.current = req;

            try {
              const list = await geocode(v, { limit: 6, signal: req.signal, timeoutMs: 6000 });
              setOptions(list);
            } catch (e: unknown) {
              if (req.signal.aborted) return;
              setError(e instanceof Error ? e.message : "Geocoding failed");
            }
          }, 350),
      []
  );

  useEffect(() => {
    debouncedSearch(q);
  }, [q, debouncedSearch]);

  useEffect(() => {
    saveLayouts(layouts);
  }, [layouts]);

  useEffect(() => {
    const saved = loadSelectedCity();
    const fallback = loadDefaultPin();
    if (saved) void loadWeather(saved);
    else if (fallback) void loadWeather(pinnedToGeo(fallback));
  }, [loadWeather]);

  useEffect(() => {
    savePins(pins);
  }, [pins]);

  useEffect(() => {
    saveDefaultPin(defaultPin);
  }, [defaultPin]);

  useEffect(() => {
    localStorage.setItem(ALERT_RULES_KEY, JSON.stringify(alertRules));
  }, [alertRules]);

  useEffect(() => {
    localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts.slice(0, 200)));
  }, [alerts]);

  useEffect(() => {
    if (!autoRefresh) return;
    if (!selected) return;

    let alive = true;
    let t: number | null = null;

    const tick = async () => {
      if (!alive) return;
      const baseMs = clamp(autoRefreshMin, 1, 60) * 60_000;
      const backoff = autoBackoffRef.current;
      const ms = Math.round(baseMs * Math.max(1, backoff));
      await loadWeather(selected, { silent: true });
      if (!alive) return;
      t = window.setTimeout(() => void tick(), ms);
    };

    t = window.setTimeout(() => void tick(), 250);

    return () => {
      alive = false;
      if (t) window.clearTimeout(t);
    };
  }, [autoRefresh, autoRefreshMin, selected, loadWeather]);

  const filteredForecast = useMemo(() => {
    if (!forecastData.length) return [];
    const start = forecastData[0].date.getTime();
    const end = start + rangeHours * 3600_000;
    const slice = forecastData.filter((p) => p.date.getTime() <= end);
    const s = Math.max(1, step);
    return slice.filter((_, i) => i % s === 0);
  }, [forecastData, rangeHours, step]);

  const next24Stats = useMemo(() => {
    if (forecastData.length < 2) return null;

    const start = forecastData[0].date.getTime();
    const end = start + 24 * 3600_000;
    const pts = forecastData.filter((p) => p.date.getTime() >= start && p.date.getTime() <= end);
    if (!pts.length) return null;

    const temps = pts.map((p) => p.temp).filter((v) => Number.isFinite(v));
    const hums = pts.map((p) => p.humidity).filter((v) => Number.isFinite(v));
    const winds = pts.map((p) => p.wind).filter((v) => Number.isFinite(v));

    const minT = temps.length ? Math.min(...temps) : null;
    const maxT = temps.length ? Math.max(...temps) : null;
    const avgH = hums.length ? hums.reduce((a, b) => a + b, 0) / hums.length : null;
    const maxW = winds.length ? Math.max(...winds) : null;

    const minP = pts.reduce((acc, p) => (p.temp < acc.temp ? p : acc), pts[0]);
    const maxP = pts.reduce((acc, p) => (p.temp > acc.temp ? p : acc), pts[0]);

    const firstT = temps.length ? temps[0] : null;
    const lastT = temps.length ? temps[temps.length - 1] : null;
    const trend = firstT != null && lastT != null ? lastT - firstT : null;

    return { minT, maxT, avgH, maxW, minAt: minP.date, maxAt: maxP.date, trend };
  }, [forecastData]);

  const allGroups = useMemo(() => {
    const set = new Set<string>();
    set.add("UA");
    set.add("EU");
    set.add("Travel");
    for (const p of pins) {
      const g = (p.group ?? "").trim();
      if (g) set.add(g);
    }
    return ["all", ...Array.from(set)];
  }, [pins]);

  const filteredPins = useMemo(() => {
    const f = pinFilter.trim().toLowerCase();
    const base = pinGroup === "all" ? pins : pins.filter((p) => (p.group ?? "") === pinGroup);
    if (!f) return base;
    return base.filter((p) => `${p.name} ${p.state ?? ""} ${p.country}`.toLowerCase().includes(f));
  }, [pins, pinFilter, pinGroup]);

  const loadFromMyLocation = useCallback(async () => {
    if (!("geolocation" in navigator)) {
      setError("Geolocation is not supported in this browser");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 9000,
          maximumAge: 60_000,
        });
      });

      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;

      const pseudo: GeoItem = { name: "My location", lat, lon, country: "", state: "" };
      setQ("My location");
      setOptions([]);
      await loadWeather(pseudo);
      setInfoSafe("Loaded from your location");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to get location");
    } finally {
      setLoading(false);
    }
  }, [loadWeather, setInfoSafe]);

  const pinCurrent = useCallback(() => {
    if (!selected) return;

    const p: Pinned = {
      name: selected.name,
      lat: selected.lat,
      lon: selected.lon,
      country: selected.country,
      state: selected.state,
      group: pins.find((x) => x.lat === selected.lat && x.lon === selected.lon)?.group ?? "",
    };

    const exists = pins.some((x) => x.lat === p.lat && x.lon === p.lon);
    const next = [p, ...pins.filter((x) => !(x.lat === p.lat && x.lon === p.lon))].slice(0, 12);

    setPins(next);
    if (!defaultPin) setDefaultPin(p);

    setInfoSafe(exists ? `Pinned updated: ${p.name}` : `Pinned: ${p.name}`);
  }, [defaultPin, pins, selected, setInfoSafe]);

  const unpin = useCallback(
      (p: Pinned) => {
        const next = pins.filter((x) => !(x.lat === p.lat && x.lon === p.lon));
        setPins(next);
        if (defaultPin && defaultPin.lat === p.lat && defaultPin.lon === p.lon) setDefaultPin(next[0] ?? null);
        setInfoSafe(`Unpinned: ${p.name}`);
      },
      [defaultPin, pins, setInfoSafe]
  );

  // movePin - kept for potential future drag-to-reorder feature
  // const movePin = useCallback(
  //     (index: number, dir: -1 | 1) => {
  //       const next = [...pins];
  //       const to = index + dir;
  //       if (to < 0 || to >= next.length) return;
  //       const tmp = next[index];
  //       next[index] = next[to];
  //       next[to] = tmp;
  //       setPins(next);
  //     },
  //     [pins]
  // );

  const clearPins = useCallback(() => {
    setPins([]);
    setDefaultPin(null);
    setInfoSafe("Pinned cleared");
  }, [setInfoSafe]);

  const resetLayouts = useCallback(() => {
    setLayouts(ensureLayouts(DEFAULT_LAYOUTS, DEFAULT_LAYOUTS, widgetIds));
    setCombinedWidgets({});
    setInfoSafe("Layout reset");
  }, [widgetIds, setInfoSafe]);

  // Combine two widgets into tabs
  const combineWidgets = useCallback((targetId: string, sourceId: string) => {
    if (targetId === sourceId) return;

    setCombinedWidgets((prev) => {
      const newCombined = { ...prev };

      // Get existing tabs for target, or create new array with just target
      const targetTabs = newCombined[targetId] || [targetId];

      // Get source tabs (if source was already a combined widget)
      const sourceTabs = newCombined[sourceId] || [sourceId];

      // Merge tabs
      const merged = [...new Set([...targetTabs, ...sourceTabs])];
      newCombined[targetId] = merged;

      // Remove source from combined (it's now part of target)
      delete newCombined[sourceId];

      return newCombined;
    });

    // Increase layout height for the combined widget
    setLayouts((prev) => {
      const bps: Breakpoint[] = ["xl", "lg", "md", "sm", "xs"];
      const out: RGLLayouts = {};

      for (const bp of bps) {
        const layout = (prev[bp] ?? []) as Layout;
        out[bp] = layout.map((item) => {
          if (item.i === targetId) {
            // Get source widget height to add
            const sourceItem = layout.find((l) => l.i === sourceId);
            const addHeight = sourceItem ? Math.max(6, Math.floor(sourceItem.h * 0.7)) : 8;
            return { ...item, h: item.h + addHeight };
          }
          return item;
        });
      }

      return out;
    });

    setInfoSafe(`Combined widgets`);
  }, [setInfoSafe]);

  // Split a widget out of a combined group
  const splitWidget = useCallback((groupId: string, widgetId: string) => {
    setCombinedWidgets((prev) => {
      const newCombined = { ...prev };
      const tabs = newCombined[groupId];

      if (!tabs || tabs.length <= 1) return prev;

      // Remove widget from group
      newCombined[groupId] = tabs.filter((id) => id !== widgetId);

      // If only one left, remove the group
      if (newCombined[groupId].length === 1) {
        delete newCombined[groupId];
      }

      return newCombined;
    });

    // Reduce layout height for the combined widget
    setLayouts((prev) => {
      const bps: Breakpoint[] = ["xl", "lg", "md", "sm", "xs"];
      const out: RGLLayouts = {};

      for (const bp of bps) {
        const layout = (prev[bp] ?? []) as Layout;
        out[bp] = layout.map((item) => {
          if (item.i === groupId) {
            // Reduce height but keep minimum
            const newH = Math.max(8, item.h - 6);
            return { ...item, h: newH };
          }
          return item;
        });
      }

      return out;
    });

    setInfoSafe(`Split widget`);
  }, [setInfoSafe]);

  const refreshPinPreview = useCallback(
      async (p: Pinned) => {
        const k = pinKey(p);
        const prev = pinPreviews[k];
        if (prev && Date.now() - prev.updatedAt < 2 * 60_000) return;

        try {
          const cur = await getCurrent(p.lat, p.lon, { timeoutMs: 7000, retries: 0 });
          const cw = cur as unknown as CurrentWeather;
          const temp = safeNum(cw.main?.temp);
          const wind = safeNum(cw.wind?.speed);

          setPinPreviews((m) => ({
            ...m,
            [k]: { ok: true, temp, wind, updatedAt: Date.now() },
          }));
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Preview failed";
          setPinPreviews((m) => ({
            ...m,
            [k]: { ok: false, temp: null, wind: null, updatedAt: Date.now(), message: msg },
          }));
        }
      },
      [pinPreviews]
  );

  // Batch refresh all pinned cities at once
  const refreshAllPinPreviews = useCallback(async () => {
    if (!pins.length) return;

    const pinsToRefresh = pins.slice(0, 12).filter((p) => {
      const k = pinKey(p);
      const prev = pinPreviews[k];
      return !prev || Date.now() - prev.updatedAt >= 2 * 60_000;
    });

    if (!pinsToRefresh.length) return;

    try {
      const locations = pinsToRefresh.map((p) => ({ lat: p.lat, lon: p.lon }));
      const response = await getBatchWeather(locations, { timeoutMs: 15000 });

      const updates: Record<string, PinPreview> = {};
      for (const result of response.data) {
        const pin = pinsToRefresh.find(
          (p) => Math.abs(p.lat - result.lat) < 0.001 && Math.abs(p.lon - result.lon) < 0.001
        );
        if (!pin) continue;

        const k = pinKey(pin);
        if (result.error) {
          updates[k] = { ok: false, temp: null, wind: null, updatedAt: Date.now(), message: result.error };
        } else if (result.data) {
          const temp = safeNum(result.data.main?.temp);
          const wind = safeNum(result.data.wind?.speed);
          updates[k] = { ok: true, temp, wind, updatedAt: Date.now() };
        }
      }

      if (Object.keys(updates).length > 0) {
        setPinPreviews((m) => ({ ...m, ...updates }));
      }
    } catch {
      // Fallback to individual requests
      await Promise.all(pinsToRefresh.map((p) => refreshPinPreview(p)));
    }
  }, [pins, pinPreviews, refreshPinPreview]);

  useEffect(() => {
    if (!pins.length) return;
    const id = window.setTimeout(() => {
      void refreshAllPinPreviews();
    }, 0);
    return () => window.clearTimeout(id);
  }, [pins, refreshAllPinPreviews]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key;
      const tgt = e.target as HTMLElement | null;
      const isTyping =
          !!tgt && (tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || (tgt as HTMLElement).isContentEditable);

      if (key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (isTyping) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (key === "r" || key === "R") {
        if (selected && !loading) void loadWeather(selected);
      }

      if (key === "p" || key === "P") {
        pinCurrent();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [loadWeather, loading, pinCurrent, selected]);

  const rangeChips = useMemo(() => (
      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ minWidth: 0, justifyContent: "center" }}>
        {[24, 48, 72, 120].map((h) => (
            <Chip
                key={h}
                size="small"
                label={`${h}h`}
                color={rangeHours === h ? "primary" : "default"}
                variant="outlined"
                onClick={() => setRangeHours(h)}
                sx={{ cursor: "pointer" }}
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
                sx={{ cursor: "pointer" }}
            />
        ))}
      </Stack>
  ), [rangeHours, step]);

  const health = useMemo(() => {
    if (error) return { label: "red", color: "error" as const };
    if (loading) return { label: "yellow", color: "warning" as const };
    return { label: "green", color: "success" as const };
  }, [error, loading]);

  const sunrise = current?.sys?.sunrise;
  const sunset = current?.sys?.sunset;

  const ellipsisChipSx = useMemo(() => ({
    maxWidth: "100%",
    minWidth: 0,
    "& .MuiChip-label": {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      minWidth: 0,
    },
  } as const), []);

  // Get combine options for a widget (all other widgets)
  const getCombineOptions = useCallback((currentId: string) => {
    const widgetLabels: Record<string, string> = {
      overview: "🏠 Overview",
      forecast: "🌡️ Temperature",
      humidity: "💧 Humidity",
      wind: "💨 Wind",
      pins: "📌 Pinned Cities",
      monitoring: "📊 Monitoring",
      serverstats: "🖥️ Server Stats",
    };
    return widgetIds
      .filter((id) => id !== currentId)
      .map((id) => ({ id, label: widgetLabels[id] || id }));
  }, [widgetIds]);

  const widgets: Record<string, React.ReactNode> = useMemo(() => ({
    overview: (
        <WidgetCard
            title="Overview"
            combineOptions={getCombineOptions("overview")}
            onCombine={(targetId) => combineWidgets("overview", targetId)}
            bodySx={{
              overflow: "auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              pr: 1.5,
            }}
        >
          {/* Loading State */}
          {loading && !current && (
            <WeatherSkeleton />
          )}

          {/* Empty State - No city selected */}
          {!loading && !current && !selected && (
            <EmptyState
              type="no-city"
              suggestions={["Kyiv", "London", "Tokyo", "New York"]}
            />
          )}

          {/* Main Weather Display */}
          {current && (
            <Stack spacing={1.5} sx={{ width: "100%", minWidth: 0, alignItems: "center" }}>
              {/* City & Update Info */}
              <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center" useFlexGap>
                <Chip
                    size="small"
                    label={title}
                    variant="outlined"
                    color="primary"
                    sx={{
                      ...ellipsisChipSx,
                      maxWidth: { xs: 200, sm: 280, md: 360 },
                      borderRadius: 1,
                    }}
                />
                <Chip
                    size="small"
                    label={`Updated: ${formatUpdated(lastLoadedAt)}`}
                    color="primary"
                    variant="outlined"
                    sx={{
                      ...ellipsisChipSx,
                      maxWidth: 140,
                      borderRadius: 1,
                      animation: isRefreshing ? `${pulseRefresh} 1s ease-in-out infinite` : "none",
                    }}
                />
              </Stack>

              {/* Hero Section: Icon + Temperature */}
              <Box
                sx={{
                  width: "100%",
                  py: { xs: 1.5, md: 2 },
                  px: 2,
                  borderRadius: 1,
                  background: getTempGradient(current.main.temp),
                  border: `1px solid ${getTempColor(current.main.temp)}20`,
                }}
              >
                <Stack
                  direction={{ xs: "column", sm: "row" }}
                  spacing={2}
                  alignItems="center"
                  justifyContent="center"
                >
                  {/* Weather Icon */}
                  <WeatherIcon
                    code={current.weather?.[0]?.icon}
                    size={isMobile ? 64 : 80}
                    animated={!loading}
                  />

                  {/* Temperature + Description */}
                  <Stack alignItems={{ xs: "center", sm: "flex-start" }} spacing={0.5}>
                    <Typography
                      variant="h2"
                      sx={{
                        fontWeight: 950,
                        lineHeight: 1,
                        fontSize: { xs: "2.5rem", sm: "3rem", md: "3.5rem" },
                        color: getTempColor(current.main.temp),
                        textShadow: `0 0 20px ${getTempColor(current.main.temp)}40`,
                      }}
                    >
                      {current.main.temp.toFixed(1)}°C
                    </Typography>
                    <Typography variant="body2" color="text.secondary" fontWeight={700}>
                      {current.weather?.[0]?.description
                        ? current.weather[0].description.charAt(0).toUpperCase() + current.weather[0].description.slice(1)
                        : getTempDescription(current.main.temp)}
                    </Typography>
                    {current.main.feels_like != null && (
                      <Typography variant="caption" color="text.secondary">
                        Feels like {Number(current.main.feels_like).toFixed(1)}°C
                      </Typography>
                    )}
                  </Stack>
                </Stack>
              </Box>

              {/* Quick Stats Grid */}
              <Box
                sx={{
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" },
                  gap: 1.5,
                }}
              >
                <Box sx={{ p: 1.5, borderRadius: 1, border: "1px solid rgba(37,243,225,0.1)", background: "rgba(14,18,24,0.5)", textAlign: "center" }}>
                  <Typography variant="caption" color="text.secondary" display="block">💧 Humidity</Typography>
                  <Typography variant="body2" fontWeight={900}>{current.main.humidity}%</Typography>
                </Box>
                <Box sx={{ p: 1.5, borderRadius: 1, border: `1px solid ${getWindColor(current.wind.speed)}20`, background: "rgba(14,18,24,0.5)", textAlign: "center" }}>
                  <Typography variant="caption" color="text.secondary" display="block">💨 Wind</Typography>
                  <Typography variant="body2" fontWeight={900} sx={{ color: getWindColor(current.wind.speed) }}>
                    {current.wind.speed.toFixed(1)} m/s
                  </Typography>
                </Box>
                {current.main.pressure != null && (
                  <Box sx={{ p: 1.5, borderRadius: 1, border: "1px solid rgba(37,243,225,0.1)", background: "rgba(14,18,24,0.5)", textAlign: "center" }}>
                    <Typography variant="caption" color="text.secondary" display="block">🌡️ Pressure</Typography>
                    <Typography variant="body2" fontWeight={900}>{current.main.pressure} hPa</Typography>
                  </Box>
                )}
                {current.visibility != null && (
                  <Box sx={{ p: 1.5, borderRadius: 1, border: "1px solid rgba(37,243,225,0.1)", background: "rgba(14,18,24,0.5)", textAlign: "center" }}>
                    <Typography variant="caption" color="text.secondary" display="block">👁️ Visibility</Typography>
                    <Typography variant="body2" fontWeight={900}>{(current.visibility / 1000).toFixed(1)} km</Typography>
                  </Box>
                )}
              </Box>

              {/* Sun Times */}
              <Stack direction="row" spacing={2} justifyContent="center" flexWrap="wrap" useFlexGap>
                <Chip
                  size="small"
                  label={`🌅 ${fmtClock(sunrise)}`}
                  variant="outlined"
                  sx={ellipsisChipSx}
                />
                <Chip
                  size="small"
                  label={`🌇 ${fmtClock(sunset)}`}
                  variant="outlined"
                  sx={ellipsisChipSx}
                />
                <Chip
                  size="small"
                  label={`☀️ ${dayLengthLabel(sunrise, sunset)}`}
                  variant="outlined"
                  sx={ellipsisChipSx}
                />
              </Stack>

              <Divider sx={{ opacity: 0.3, width: "100%" }} />

              {/* 24h Forecast Summary */}
              <Box
                sx={{
                  width: "100%",
                  p: 1.5,
                  borderRadius: 1,
                  border: "1px solid rgba(37,243,225,0.1)",
                  background: "rgba(14,18,24,0.5)",
                }}
              >
                <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 1 }}>
                  Next 24 hours
                </Typography>
                {!next24Stats ? (
                  <Typography variant="body2" color="text.secondary">Loading forecast...</Typography>
                ) : (
                  <Stack direction="row" flexWrap="wrap" justifyContent="center" gap={1} useFlexGap sx={{ mt: 0.5 }}>
                    <Chip
                      size="small"
                      label={`${next24Stats.minT?.toFixed(0)}° — ${next24Stats.maxT?.toFixed(0)}°`}
                      color="primary"
                      variant="outlined"
                      sx={ellipsisChipSx}
                    />
                    <Chip
                      size="small"
                      label={`💧 ${Math.round(next24Stats.avgH ?? 0)}%`}
                      variant="outlined"
                      sx={ellipsisChipSx}
                    />
                    <Chip
                      size="small"
                      label={`💨 max ${next24Stats.maxW?.toFixed(1)} m/s`}
                      variant="outlined"
                      sx={ellipsisChipSx}
                    />
                    <Chip
                      size="small"
                      label={
                        next24Stats.trend == null
                          ? "→ stable"
                          : next24Stats.trend > 0.5
                            ? `↑ +${next24Stats.trend.toFixed(1)}°`
                            : next24Stats.trend < -0.5
                              ? `↓ ${next24Stats.trend.toFixed(1)}°`
                              : "→ stable"
                      }
                      color={Math.abs(next24Stats.trend ?? 0) > 3 ? "warning" : "default"}
                      variant="outlined"
                      sx={ellipsisChipSx}
                    />
                  </Stack>
                )}
              </Box>

              {/* Auto Refresh & Alerts - Collapsible on mobile */}
              <Box sx={{ width: "100%" }}>
                <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                  <FormControlLabel
                    control={<Switch size="small" checked={autoRefresh} onChange={(_, v) => setAutoRefresh(v)} />}
                    label={<Typography variant="body2">Auto refresh</Typography>}
                  />
                  <Stack direction="row" spacing={0.5}>
                    {[5, 10, 15].map((m) => (
                      <Chip
                        key={m}
                        size="small"
                        label={`${m}m`}
                        color={autoRefreshMin === m ? "primary" : "default"}
                        variant="outlined"
                        onClick={() => setAutoRefreshMin(m)}
                        sx={{ cursor: "pointer", opacity: autoRefresh ? 1 : 0.5 }}
                        disabled={!autoRefresh}
                      />
                    ))}
                  </Stack>
                </Stack>

                {/* Alerts section */}
                <Collapse in={!isMobile || alertsOpen} timeout={200}>
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ mb: 1 }}>
                    <Typography variant="subtitle2" fontWeight={900}>⚡ Alert Rules</Typography>
                    {isMobile && (
                      <Button size="small" variant="text" onClick={() => setAlertsOpen(!alertsOpen)}>
                        {alertsOpen ? "Hide" : "Show"}
                      </Button>
                    )}
                  </Stack>
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
                    {alertRules.map((r) => (
                      <Box
                        key={r.id}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 0.5,
                          p: 1,
                          borderRadius: 1,
                          border: "1px solid rgba(37,243,225,0.1)",
                          background: "rgba(14,18,24,0.5)",
                        }}
                      >
                        <Chip
                          size="small"
                          label={r.kind === "wind_gt" ? "💨 >" : "🌡️ <"}
                          color={r.enabled ? "primary" : "default"}
                          variant="outlined"
                          onClick={() => setAlertRules((prev) => prev.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)))}
                          sx={{ cursor: "pointer" }}
                        />
                        <TextField
                          size="small"
                          value={String(r.value)}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (Number.isFinite(n)) setAlertRules((prev) => prev.map((x) => (x.id === r.id ? { ...x, value: n } : x)));
                          }}
                          inputProps={{ style: { textAlign: "center", padding: "4px 8px" } }}
                          sx={{ width: 60 }}
                          disabled={!r.enabled}
                        />
                        <Typography variant="caption" color="text.secondary">
                          {r.kind === "wind_gt" ? "m/s" : "°C"}
                        </Typography>
                        <Tooltip title={r.notify ? "Notifications on" : "Notifications off"}>
                          <IconButton
                            size="small"
                            color={r.notify ? "primary" : "default"}
                            onClick={() => setAlertRules((prev) => prev.map((x) => (x.id === r.id ? { ...x, notify: !x.notify } : x)))}
                            disabled={!r.enabled}
                            sx={{ p: 0.5 }}
                          >
                            {r.notify ? <NotificationsActiveIcon sx={{ fontSize: 18 }} /> : <NotificationsOffIcon sx={{ fontSize: 18 }} />}
                          </IconButton>
                        </Tooltip>
                      </Box>
                    ))}
                  </Box>

                  {/* Alert History */}
                  {alerts.length > 0 && (
                    <Box sx={{ mt: 1 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Chip size="small" label={`${alerts.length} alerts`} color="warning" variant="outlined" />
                        <Button size="small" variant="text" onClick={() => { setAlerts([]); setInfoSafe("Alerts cleared"); }}>
                          Clear
                        </Button>
                      </Stack>
                      <Stack spacing={0.5} sx={{ mt: 0.5, maxHeight: 120, overflow: "auto" }}>
                        {alerts.slice(0, 5).map((a) => (
                          <Box
                            key={a.id}
                            sx={{
                              p: 0.75,
                              borderRadius: 1,
                              background: a.severity === "crit" ? "rgba(239,68,68,0.15)" : "rgba(251,191,36,0.1)",
                              border: `1px solid ${a.severity === "crit" ? "rgba(239,68,68,0.3)" : "rgba(251,191,36,0.2)"}`,
                            }}
                          >
                            <Typography variant="caption" fontWeight={700}>{a.city}</Typography>
                            <Typography variant="caption" color="text.secondary" display="block">{a.message}</Typography>
                          </Box>
                        ))}
                      </Stack>
                    </Box>
                  )}
                </Collapse>

                {/* Show alerts toggle on mobile when collapsed */}
                {isMobile && !alertsOpen && (
                  <Button
                    size="small"
                    variant="outlined"
                    fullWidth
                    onClick={() => setAlertsOpen(true)}
                    sx={{ mt: 1 }}
                  >
                    ⚡ Show Alert Rules {alerts.length > 0 && `(${alerts.length})`}
                  </Button>
                )}
              </Box>
            </Stack>
          )}
        </WidgetCard>
    ),

    forecast: (
        <WidgetCard
            title="🌡️ Temperature"
            subtitle="Temperature forecast"
            combineOptions={getCombineOptions("forecast")}
            onCombine={(targetId) => combineWidgets("forecast", targetId)}
            bodySx={{ flex: 1 }}
        >
          <Box sx={{ mb: 1 }}>
            {rangeChips}
          </Box>
          <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
            {loading && !forecastData.length ? (
              <ChartSkeleton height={200} />
            ) : forecastData.length < 2 ? (
              <ChartPlaceholder height={200} />
            ) : (
              <TempLineChart data={filteredForecast} />
            )}
          </Box>
        </WidgetCard>
    ),

    humidity: (
        <WidgetCard
            title="💧 Humidity"
            subtitle="Humidity forecast"
            combineOptions={getCombineOptions("humidity")}
            onCombine={(targetId) => combineWidgets("humidity", targetId)}
            bodySx={{ flex: 1 }}
        >
          <Box sx={{ mb: 1 }}>
            {rangeChips}
          </Box>
          <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
            {loading && !forecastData.length ? (
              <ChartSkeleton height={180} />
            ) : forecastData.length < 2 ? (
              <ChartPlaceholder height={180} />
            ) : (
              <HumidityChart data={filteredForecast} />
            )}
          </Box>
        </WidgetCard>
    ),

    wind: (
        <WidgetCard
            title="💨 Wind Speed"
            subtitle="Forecast wind conditions"
            combineOptions={getCombineOptions("wind")}
            onCombine={(targetId) => combineWidgets("wind", targetId)}
            bodySx={{ flex: 1 }}
        >
          <Box sx={{ mb: 1 }}>
            {rangeChips}
          </Box>
          <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
            {loading && !forecastData.length ? (
              <ChartSkeleton height={180} />
            ) : forecastData.length < 2 ? (
              <ChartPlaceholder height={180} />
            ) : (
              <WindChart data={filteredForecast} />
            )}
          </Box>
        </WidgetCard>
    ),

    pins: (
        <WidgetCard
            title="📌 Pinned Cities"
            scroll
            combineOptions={getCombineOptions("pins")}
            onCombine={(targetId) => combineWidgets("pins", targetId)}
            right={
              <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                <Chip size="small" label={`${pins.length}/12`} variant="outlined" color="primary" sx={ellipsisChipSx} />
                <Button
                    size="small"
                    variant="outlined"
                    color="primary"
                    disabled={pins.length === 0}
                    onClick={clearPins}
                    sx={{ height: 28, px: 1, whiteSpace: "nowrap", fontSize: 12 }}
                >
                  Clear
                </Button>
              </Stack>
            }
        >
          <Stack spacing={1} sx={{ alignItems: "center" }}>
            {/* Empty state */}
            {pins.length === 0 && (
              <EmptyState
                type="no-pins"
                message="Pin your favorite cities for quick access. Use the 📌 button or press P."
                suggestions={["Kyiv", "London", "Tokyo"]}
              />
            )}

            {pins.length > 0 && (
              <>
                {/* Group filter */}
                <Stack direction="row" spacing={0.5} flexWrap="wrap" justifyContent="center" useFlexGap sx={{ minWidth: 0 }}>
                  {allGroups.map((g) => (
                    <Chip
                      key={g}
                      size="small"
                      label={g === "all" ? "All" : g}
                      color={pinGroup === g ? "primary" : "default"}
                      variant="outlined"
                      onClick={() => setPinGroup(g)}
                      sx={{ cursor: "pointer", height: 24, fontSize: 11, borderRadius: 1 }}
                    />
                  ))}
                </Stack>

                {/* Search filter */}
                <TextField
                  size="small"
                  value={pinFilter}
                  onChange={(e) => setPinFilter(e.target.value)}
                  placeholder="🔍 Filter cities..."
                  sx={{ width: "100%", maxWidth: 400, "& .MuiOutlinedInput-root": { borderRadius: 1 } }}
                  inputProps={{ style: { textAlign: "center", padding: "6px 12px" } }}
                />

                {/* No matches */}
                {filteredPins.length === 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                    No cities match your filter
                  </Typography>
                )}

                {/* Pinned cities list */}
                {filteredPins.length > 0 && (
                  <Box sx={{ width: "100%", display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.5 }}>
                    {filteredPins.map((p) => {
                      const isDefault = !!defaultPin && defaultPin.lat === p.lat && defaultPin.lon === p.lon;
                      const pk = pinKey(p);
                      const pv = pinPreviews[pk];
                      const isSelected = selected && selected.lat === p.lat && selected.lon === p.lon;

                      return (
                        <Box
                          key={`${p.lat}:${p.lon}`}
                          onClick={() => void loadWeather(pinnedToGeo(p))}
                          sx={{
                            p: 1.5,
                            borderRadius: 1,
                            border: isSelected
                              ? "2px solid rgba(37,243,225,0.5)"
                              : "1px solid rgba(37,243,225,0.12)",
                            background: isSelected
                              ? "rgba(37,243,225,0.08)"
                              : "rgba(14, 18, 24, 0.5)",
                            cursor: "pointer",
                            transition: "all 0.2s",
                            "&:hover": {
                              background: "rgba(37,243,225,0.12)",
                              borderColor: "rgba(37,243,225,0.3)",
                            },
                          }}
                        >
                          <Stack spacing={0.75}>
                            {/* Top row: City name + actions */}
                            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                                {isDefault && <StarIcon sx={{ fontSize: 14, color: "#FACC15", flexShrink: 0 }} />}
                                <Typography sx={{ fontSize: 14, fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {p.name}
                                </Typography>
                              </Stack>
                              <Stack direction="row" spacing={0} sx={{ flexShrink: 0 }}>
                                <Tooltip title={isDefault ? "Remove default" : "Set as default"}>
                                  <IconButton
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDefaultPin(isDefault ? null : p);
                                      setInfoSafe(isDefault ? "Default removed" : `Default: ${p.name}`);
                                    }}
                                    sx={{ p: 0.5 }}
                                  >
                                    {isDefault ? <StarIcon sx={{ fontSize: 16, color: "#FACC15" }} /> : <StarBorderIcon sx={{ fontSize: 16 }} />}
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Remove">
                                  <IconButton
                                    size="small"
                                    onClick={(e) => { e.stopPropagation(); unpin(p); }}
                                    sx={{ p: 0.5 }}
                                  >
                                    <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                                  </IconButton>
                                </Tooltip>
                              </Stack>
                            </Box>

                            {/* Bottom row: Country/group + weather */}
                            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                                {p.country}{p.group ? ` · ${p.group}` : ""}
                              </Typography>
                              {pv?.ok && (
                                <Stack direction="row" spacing={1} alignItems="baseline">
                                  <Typography
                                    sx={{
                                      fontSize: 16,
                                      fontWeight: 900,
                                      color: pv.temp != null ? getTempColor(pv.temp) : "inherit"
                                    }}
                                  >
                                    {pv.temp != null ? `${pv.temp.toFixed(0)}°` : "—"}
                                  </Typography>
                                  <Typography sx={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
                                    {pv.wind != null ? `${pv.wind.toFixed(1)} m/s` : ""}
                                  </Typography>
                                </Stack>
                              )}
                            </Box>
                          </Stack>
                        </Box>
                      );
                    })}
                  </Box>
                )}

                {/* Group assignment (only when a pinned city is selected) */}
                {selected && pins.some((x) => x.lat === selected.lat && x.lon === selected.lon) && (
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" justifyContent="center" useFlexGap alignItems="center" sx={{ pt: 1 }}>
                    <Typography variant="caption" color="text.secondary">Group:</Typography>
                    {["UA", "EU", "Travel", ""].map((g) => (
                      <Chip
                        key={`g:${g || "None"}`}
                        size="small"
                        label={g || "none"}
                        variant="outlined"
                        onClick={() => {
                          const s = selected;
                          if (!s) return;
                          const next = pins.map((x) => (x.lat === s.lat && x.lon === s.lon ? { ...x, group: g || undefined } : x));
                          setPins(next);
                          setInfoSafe(g ? `Group: ${g}` : "Group cleared");
                        }}
                        sx={{ cursor: "pointer", height: 22, fontSize: 10, borderRadius: 1 }}
                      />
                    ))}
                  </Stack>
                )}
              </>
            )}
          </Stack>
        </WidgetCard>
    ),

    monitoring: (
        <WidgetCard
            title="📊 Monitoring"
            combineOptions={[
                { id: "serverstats", label: "🖥️ Server Stats" },
                { id: "forecast", label: "🌡️ Temperature" },
                { id: "humidity", label: "💧 Humidity" },
                { id: "wind", label: "💨 Wind" },
            ]}
            onCombine={(targetId) => combineWidgets("monitoring", targetId)}
            cardSx={{ height: "fit-content" }}
        >
          <MonitoringPanel />
        </WidgetCard>
    ),

    serverstats: (
        <WidgetCard
            title="🖥️ Server Stats"
            subtitle="Detailed server metrics"
            combineOptions={[
                { id: "monitoring", label: "📊 Monitoring" },
                { id: "forecast", label: "🌡️ Temperature" },
                { id: "humidity", label: "💧 Humidity" },
                { id: "wind", label: "💨 Wind" },
            ]}
            onCombine={(targetId) => combineWidgets("serverstats", targetId)}
        >
          <ServerStatsPanel />
        </WidgetCard>
    ),
  }), [
    getCombineOptions, combineWidgets, loading, current, selected, title,
    lastLoadedAt, isRefreshing, isMobile,
    sunrise, sunset, next24Stats, autoRefresh,
    autoRefreshMin, alertRules, alerts, alertsOpen, health, setInfoSafe,
    setAutoRefresh, setAutoRefreshMin, setAlertRules, setAlerts, setAlertsOpen,
    rangeChips, forecastData, filteredForecast, pins, clearPins, pinGroup,
    pinFilter, allGroups, filteredPins, defaultPin, pinPreviews, unpin,
    loadWeather, setPins, setDefaultPin, setPinGroup, setPinFilter,
    ellipsisChipSx
  ]);

  // Build final widgets with combined ones
  const finalWidgets = useMemo(() => {
    // Widget metadata for combining (inside useMemo to avoid recreation)
    const widgetMeta: Record<string, { title: string; icon: string; content: ReactNode }> = {
      overview: { title: "Overview", icon: "🏠", content: widgets.overview },
      forecast: { title: "Temperature", icon: "🌡️", content: widgets.forecast },
      humidity: { title: "Humidity", icon: "💧", content: widgets.humidity },
      wind: { title: "Wind", icon: "💨", content: widgets.wind },
      pins: { title: "Pinned Cities", icon: "📌", content: widgets.pins },
      monitoring: { title: "Monitoring", icon: "📊", content: <MonitoringPanel /> },
      serverstats: { title: "Server Stats", icon: "🖥️", content: <ServerStatsPanel /> },
    };

    const result: Record<string, ReactNode> = {};
    const usedInCombine = new Set<string>();

    // Find which widgets are used as secondary in a combine
    for (const [, combined] of Object.entries(combinedWidgets)) {
      combined.slice(1).forEach((id) => usedInCombine.add(id));
    }

    for (const id of widgetIds) {
      // Skip if this widget is used in another combined widget
      if (usedInCombine.has(id)) continue;

      // Check if this widget has combined items
      const combined = combinedWidgets[id];
      if (combined && combined.length > 1) {
        // Check if all combined are charts
        const allCharts = combined.every((cid) => CHART_WIDGETS.includes(cid as ChartType));

        if (allCharts) {
          // Render as combined chart widget with shared controls
          result[id] = (
            <CombinedChartWidget
              charts={combined as ChartType[]}
              data={forecastData}
              loading={loading}
              onSplit={(chartId) => splitWidget(id, chartId)}
            />
          );
        } else {
          // Render as stacked widget (for non-charts like monitoring + serverstats)
          result[id] = (
            <TabbedWidgetCard
              tabs={combined.map((cid) => ({
                id: cid,
                title: widgetMeta[cid]?.title || cid,
                icon: widgetMeta[cid]?.icon,
                content: widgetMeta[cid]?.content,
              }))}
              onSplit={(cid) => splitWidget(id, cid)}
            />
          );
        }
      } else {
        // Render normal widget
        result[id] = widgets[id];
      }
    }

    return result;
  }, [widgetIds, combinedWidgets, forecastData, loading, splitWidget, widgets]);

  return (
      <Container maxWidth="xl" sx={{ py: { xs: 2, sm: 3, md: 4 }, overflowX: "hidden" }}>
        <Stack spacing={{ xs: 1.5, sm: 2, md: 2.5 }} sx={{ alignItems: "center" }}>
          <Typography variant="h3" sx={{ fontWeight: 900 }}>WeatherPulse</Typography>

          <GlowCard sx={{ p: { xs: 1.5, sm: 2 }, width: "100%" }}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} alignItems={{ md: "center" }} sx={{ justifyContent: "center" }}>
              <Autocomplete
                  fullWidth
                  options={options}
                  value={selected}
                  inputValue={q}
                  onInputChange={(_, v) => setQ(v)}
                  filterOptions={(x) => x}
                  onChange={(_, value) => value && void loadWeather(value)}
                  getOptionLabel={(o) => `${o.name}${o.state ? `, ${o.state}` : ""}, ${o.country}`}
                  getOptionKey={(o) => `${o.lat.toFixed(4)}:${o.lon.toFixed(4)}`}
                  isOptionEqualToValue={(a, b) => a.lat === b.lat && a.lon === b.lon}
                  sx={{ flex: 1, minWidth: { xs: "100%", md: 520 } }}
                  ListboxProps={{ style: { maxHeight: 320 } }}
                  renderInput={(params) => (
                      <TextField
                          {...params}
                          label="Search city"
                          placeholder="Kyiv, Lviv, Prague…"
                          inputRef={(node) => {
                            searchInputRef.current = node;
                            const ref0 = params.inputProps.ref;
                            if (typeof ref0 === "function") ref0(node);
                            else if (ref0 && typeof ref0 === "object" && "current" in ref0) {
                              (ref0 as MutableRefObject<HTMLInputElement | null>).current = node;
                            }
                          }}
                          InputProps={{
                            ...params.InputProps,
                            startAdornment: (
                                <>
                                  <LocationCityIcon style={{ opacity: 0.75, marginRight: 8 }} />
                                  {params.InputProps.startAdornment}
                                </>
                            ),
                          }}
                      />
                  )}
              />

              <Stack
                  direction="row"
                  spacing={1}
                  sx={{
                    width: { xs: "100%", md: "auto" },
                    justifyContent: "center",
                    flexWrap: "wrap",
                    gap: 1,
                  }}
              >
                <Tooltip title="Refresh (R)">
                <span>
                  <IconButton
                      onClick={() => selected && void loadWeather(selected)}
                      disabled={!selected || loading}
                      color="primary"
                      sx={{ height: 44, width: 44 }}
                  >
                    <RefreshIcon />
                  </IconButton>
                </span>
                </Tooltip>

                <Tooltip title="My location">
                <span>
                  <IconButton onClick={() => void loadFromMyLocation()} disabled={loading} color="primary" sx={{ height: 44, width: 44 }}>
                    <MyLocationIcon />
                  </IconButton>
                </span>
                </Tooltip>

                <Tooltip title="Pin city (P)">
                <span>
                  <IconButton onClick={pinCurrent} disabled={!selected} color="primary" sx={{ height: 44, width: 44 }}>
                    <PushPinIcon />
                  </IconButton>
                </span>
                </Tooltip>

                <Tooltip title={`${pins.length} pinned cities`}>
                  <IconButton color="primary" sx={{ height: 44, width: 44, position: "relative", display: { xs: "none", sm: "flex" } }}>
                    <BookmarksIcon />
                    <Box sx={{
                      position: "absolute",
                      top: 2,
                      right: 2,
                      minWidth: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: "rgba(37,243,225,0.95)",
                      boxShadow: "0 2px 8px rgba(37,243,225,0.6), 0 0 12px rgba(37,243,225,0.4)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 11,
                      fontWeight: 900,
                      color: "#0a0e14",
                    }}>
                      {pins.length}
                    </Box>
                  </IconButton>
                </Tooltip>

                <Button
                  onClick={resetLayouts}
                  startIcon={<RestartAltIcon />}
                  variant="outlined"
                  color="primary"
                  sx={{ height: 44, whiteSpace: "nowrap", display: { xs: "none", md: "flex" } }}
                >
                  Reset
                </Button>
              </Stack>
            </Stack>
          </GlowCard>

          {/* Mobile Tabs Navigation */}
          {isMobile && (
            <Box sx={{ width: "100%", borderBottom: 1, borderColor: "divider" }}>
              <Tabs
                value={mobileTab}
                onChange={(_, v) => setMobileTab(v)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{
                  minHeight: 40,
                  "& .MuiTab-root": {
                    minHeight: 40,
                    py: 0.5,
                    fontSize: 12,
                    fontWeight: 700,
                  },
                }}
              >
                <Tab label="🌡️ Weather" />
                <Tab label="📊 Forecast" />
                <Tab label="📌 Pins" />
                <Tab label="💨 Wind" />
                <Tab label="💧 Humidity" />
                <Tab label="📈 Monitor" />
              </Tabs>
            </Box>
          )}

          {/* Content Area */}
          <Box sx={{ width: "100%" }}>
            {/* Mobile: Show only selected tab content */}
            {isMobile ? (
              <Box sx={{ minHeight: 400 }}>
                {mobileTab === 0 && widgets.overview}
                {mobileTab === 1 && widgets.forecast}
                {mobileTab === 2 && widgets.pins}
                {mobileTab === 3 && widgets.wind}
                {mobileTab === 4 && widgets.humidity}
                {mobileTab === 5 && widgets.monitoring}
              </Box>
            ) : (
              /* Desktop/Tablet: Grid layout */
              <GridDashboard layouts={layouts} onLayoutsChange={setLayouts} childrenById={finalWidgets} />
            )}
          </Box>

          {/* Snackbars */}
          <Snackbar open={!!error} autoHideDuration={3500} onClose={() => setError(null)}>
            <Alert severity="error" variant="filled" onClose={() => setError(null)}>
              {error}
            </Alert>
          </Snackbar>

          <Snackbar
            open={!!info}
            autoHideDuration={1800}
            onClose={() => setInfo(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          >
            <Alert severity="success" variant="filled" onClose={() => setInfo(null)}>
              {info}
            </Alert>
          </Snackbar>

          {/* Auto-refresh indicator */}
          {isRefreshing && (
            <Box
              sx={{
                position: "fixed",
                top: 16,
                right: 16,
                zIndex: 1000,
                px: 1.5,
                py: 0.5,
                borderRadius: 2,
                background: "rgba(37,243,225,0.15)",
                border: "1px solid rgba(37,243,225,0.3)",
                animation: `${pulseRefresh} 1s ease-in-out infinite`,
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700, color: "#25F3E1" }}>
                Refreshing...
              </Typography>
            </Box>
          )}
        </Stack>
      </Container>
  );
}

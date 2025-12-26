import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MutableRefObject } from "react";
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
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import Collapse from "@mui/material/Collapse";

import LocationCityIcon from "@mui/icons-material/LocationCity";
import RefreshIcon from "@mui/icons-material/Refresh";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import PushPinIcon from "@mui/icons-material/PushPin";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import StarIcon from "@mui/icons-material/Star";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import MyLocationIcon from "@mui/icons-material/MyLocation";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import NotificationsOffIcon from "@mui/icons-material/NotificationsOff";

import type { Layout } from "react-grid-layout";
import { geocode, getCurrent, getForecast, createAbortableRequest } from "./api";
import type { ForecastPoint, GeoItem } from "./types";
import { debounce } from "./utils/debounce";
import { GlowCard } from "./components/GlowCard";
import { TempLineChart } from "./components/TempLineChart";
import { HumidityChart } from "./components/HumidityChart";
import { WindChart } from "./components/WindChart";
import { MonitoringPanel } from "./components/MonitoringPanel";
import { GridDashboard } from "./components/GridDashboard";
import type { RGLLayouts } from "./components/GridDashboard";
import { WidgetCard } from "./components/WidgetCard";
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
};

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

const WIDGET_IDS = ["overview", "forecast", "humidity", "wind", "pins", "monitoring"] as const;

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

function fmtShortTime(d: Date) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mo} ${hh}:${mm}`;
}

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
    { i: "overview", x: 0, y: 0, w: 5, h: 13 },
    { i: "forecast", x: 5, y: 0, w: 4, h: 10 },
    { i: "monitoring", x: 9, y: 0, w: 3, h: 14 },
    { i: "pins", x: 0, y: 13, w: 5, h: 11 },
    { i: "humidity", x: 0, y: 24, w: 9, h: 10 },
    { i: "wind", x: 9, y: 14, w: 3, h: 8 },
  ],
  lg: [
    { i: "overview", x: 0, y: 0, w: 5, h: 12 },
    { i: "forecast", x: 5, y: 0, w: 4, h: 10 },
    { i: "monitoring", x: 9, y: 0, w: 3, h: 14 },
    { i: "pins", x: 0, y: 13, w: 5, h: 11 },
    { i: "humidity", x: 0, y: 24, w: 9, h: 10 },
    { i: "wind", x: 9, y: 14, w: 3, h: 8 },
  ],
  md: [
    { i: "overview", x: 0, y: 0, w: 7, h: 15 },
    { i: "forecast", x: 7, y: 0, w: 5, h: 10 },
    { i: "pins", x: 0, y: 15, w: 7, h: 12 },
    { i: "wind", x: 7, y: 10, w: 5, h: 9 },
    { i: "humidity", x: 0, y: 27, w: 12, h: 10 },
    { i: "monitoring", x: 0, y: 37, w: 12, h: 13 },
  ],
  sm: [
    { i: "overview", x: 0, y: 0, w: 6, h: 18 },
    { i: "forecast", x: 0, y: 18, w: 6, h: 11 },
    { i: "pins", x: 0, y: 29, w: 6, h: 16 },
    { i: "wind", x: 0, y: 45, w: 6, h: 10 },
    { i: "humidity", x: 0, y: 55, w: 6, h: 11 },
    { i: "monitoring", x: 0, y: 66, w: 6, h: 16 },
  ],
  xs: [
    { i: "overview", x: 0, y: 0, w: 1, h: 22 },
    { i: "forecast", x: 0, y: 22, w: 1, h: 12 },
    { i: "pins", x: 0, y: 34, w: 1, h: 18 },
    { i: "wind", x: 0, y: 52, w: 1, h: 12 },
    { i: "humidity", x: 0, y: 64, w: 1, h: 12 },
    { i: "monitoring", x: 0, y: 76, w: 1, h: 18 },
  ],
};

function asMap(arr: Layout) {
  const m = new Map<string, LayoutItem>();
  for (const x of arr) m.set(x.i, x);
  return m;
}

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
      if (existing) next.push({ ...existing });
      else {
        const d = defMap.get(id);
        if (d) next.push({ ...d });
        else next.push({ i: id, x: 0, y: 9999, w: 4, h: 8 });
      }
    }
    out[bp] = next;
  }

  return out;
}

export default function App() {
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

  const movePin = useCallback(
      (index: number, dir: -1 | 1) => {
        const next = [...pins];
        const to = index + dir;
        if (to < 0 || to >= next.length) return;
        const tmp = next[index];
        next[index] = next[to];
        next[to] = tmp;
        setPins(next);
      },
      [pins]
  );

  const clearPins = useCallback(() => {
    setPins([]);
    setDefaultPin(null);
    setInfoSafe("Pinned cleared");
  }, [setInfoSafe]);

  const resetLayouts = useCallback(() => {
    setLayouts(ensureLayouts(DEFAULT_LAYOUTS, DEFAULT_LAYOUTS, widgetIds));
    setInfoSafe("Layout reset");
  }, [widgetIds, setInfoSafe]);

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

  useEffect(() => {
    if (!pins.length) return;
    const id = window.setTimeout(() => {
      void Promise.all(pins.slice(0, 12).map((p) => refreshPinPreview(p)));
    }, 0);
    return () => window.clearTimeout(id);
  }, [pins, refreshPinPreview]);

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

  const rangeChips = (
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
  );

  const health = useMemo(() => {
    if (error) return { label: "red", color: "error" as const };
    if (loading) return { label: "yellow", color: "warning" as const };
    return { label: "green", color: "success" as const };
  }, [error, loading]);

  const sunrise = current?.sys?.sunrise;
  const sunset = current?.sys?.sunset;

  const ellipsisChipSx = {
    maxWidth: "100%",
    minWidth: 0,
    "& .MuiChip-label": {
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      minWidth: 0,
    },
  } as const;

  const widgets: Record<string, React.ReactNode> = {
    overview: (
        <WidgetCard
            title="Overview"
            right={
              <Chip
                  size="small"
                  label={title}
                  variant="outlined"
                  color="primary"
                  sx={{
                    ...ellipsisChipSx,
                    maxWidth: { xs: 200, sm: 280, md: 360, lg: 420 },
                  }}
              />
            }
            bodySx={{
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
            }}
        >
          <Stack spacing={1} sx={{ width: "100%", minWidth: 0, alignItems: "center" }}>
            <Stack
                direction="row"
                gap={1}
                flexWrap="wrap"
                useFlexGap
                alignItems="center"
                justifyContent="center"
                sx={{ width: "100%", minWidth: 0 }}
            >
              <Chip size="small" label={`Status ${health.label}`} color={health.color} variant="outlined" sx={ellipsisChipSx} />
              <Chip size="small" label="R refresh" variant="outlined" sx={ellipsisChipSx} />
              <Chip size="small" label="P pin" variant="outlined" sx={ellipsisChipSx} />
              <Chip size="small" label="/ search" variant="outlined" sx={ellipsisChipSx} />
              <Chip
                  size="small"
                  label={`Backoff x${autoBackoffRef.current.toFixed(1)}`}
                  variant="outlined"
                  color={autoBackoffRef.current > 1.2 ? "warning" : "default"}
                  sx={ellipsisChipSx}
              />
            </Stack>

            <Stack
                direction={{ xs: "column", md: "row" }}
                spacing={1}
                alignItems="stretch"
                justifyContent="center"
                useFlexGap
                sx={{ width: "100%", minWidth: 0 }}
            >
              <Box
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    border: "1px solid rgba(37,243,225,0.10)",
                    borderRadius: 2,
                    p: 1,
                    background: "rgba(14, 18, 24, 0.40)",
                    overflow: "hidden",
                  }}
              >
                <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 0.9 }}>
                  Now
                </Typography>

                <Stack direction="row" spacing={1.2} alignItems="baseline" justifyContent="center" useFlexGap flexWrap="wrap">
                  <Typography variant="h3" sx={{ fontWeight: 950, lineHeight: 1.05 }}>
                    {!loading && current ? `${current.main.temp.toFixed(1)}°C` : "—"}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 850 }}>
                    {selected ? `${selected.lat.toFixed(2)}, ${selected.lon.toFixed(2)}` : "—"}
                  </Typography>
                </Stack>

                <Stack direction="row" flexWrap="wrap" justifyContent="center" gap={1} useFlexGap sx={{ mt: 1 }}>
                  {!loading && current ? (
                      <>
                        <Chip size="small" label={`Humidity ${current.main.humidity}%`} variant="outlined" sx={ellipsisChipSx} />
                        <Chip size="small" label={`Wind ${current.wind.speed.toFixed(1)} m/s`} variant="outlined" sx={ellipsisChipSx} />
                        {current.main.feels_like != null ? (
                            <Chip size="small" label={`Feels ${Number(current.main.feels_like).toFixed(1)}°C`} variant="outlined" sx={ellipsisChipSx} />
                        ) : null}
                        {current.main.pressure != null ? (
                            <Chip size="small" label={`Pressure ${Number(current.main.pressure)} hPa`} variant="outlined" sx={ellipsisChipSx} />
                        ) : null}
                        {current.visibility != null ? (
                            <Chip size="small" label={`Visibility ${(Number(current.visibility) / 1000).toFixed(1)} km`} variant="outlined" sx={ellipsisChipSx} />
                        ) : null}
                        {current.clouds?.all != null ? (
                            <Chip size="small" label={`Clouds ${Number(current.clouds.all)}%`} variant="outlined" sx={ellipsisChipSx} />
                        ) : null}
                        {current.wind.gust != null ? (
                            <Chip size="small" label={`Gusts ${Number(current.wind.gust).toFixed(1)} m/s`} variant="outlined" sx={ellipsisChipSx} />
                        ) : null}
                      </>
                  ) : (
                      <Typography variant="body2" color="text.secondary">
                        {loading ? "Loading…" : "Choose a city above"}
                      </Typography>
                  )}
                </Stack>

                <Stack direction="row" flexWrap="wrap" justifyContent="center" gap={1} useFlexGap sx={{ mt: 1 }}>
                  <Chip
                      size="small"
                      label={`Updated: ${formatUpdated(lastLoadedAt)}`}
                      color="primary"
                      variant="outlined"
                      sx={{ ...ellipsisChipSx, maxWidth: 260 }}
                  />
                  <Chip
                      size="small"
                      label={`Sunrise ${fmtClock(sunrise)} · Sunset ${fmtClock(sunset)} · Day ${dayLengthLabel(sunrise, sunset)}`}
                      variant="outlined"
                      sx={{ ...ellipsisChipSx, maxWidth: "100%" }}
                  />
                </Stack>
              </Box>

              <Box
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 2,
                    p: 1,
                    background: "rgba(10,14,22,0.45)",
                    overflow: "hidden",
                  }}
              >
                <Typography variant="overline" color="text.secondary" sx={{ letterSpacing: 0.9 }}>
                  Next 24h
                </Typography>

                {!next24Stats ? (
                    <Typography variant="body2" color="text.secondary">
                      —
                    </Typography>
                ) : (
                    <>
                      <Stack direction="row" flexWrap="wrap" justifyContent="center" gap={1} useFlexGap sx={{ mt: 0.8 }}>
                        <Chip
                            size="small"
                            label={
                              next24Stats.minT != null && next24Stats.maxT != null
                                  ? `Temp ${next24Stats.minT.toFixed(1)}…${next24Stats.maxT.toFixed(1)}°C`
                                  : "Temp —"
                            }
                            variant="outlined"
                            color="primary"
                            sx={ellipsisChipSx}
                        />
                        <Chip
                            size="small"
                            label={next24Stats.avgH != null ? `Avg hum ${Math.round(next24Stats.avgH)}%` : "Avg hum —"}
                            variant="outlined"
                            sx={ellipsisChipSx}
                        />
                        <Chip
                            size="small"
                            label={next24Stats.maxW != null ? `Max wind ${next24Stats.maxW.toFixed(1)} m/s` : "Max wind —"}
                            variant="outlined"
                            sx={ellipsisChipSx}
                        />
                        <Chip
                            size="small"
                            label={
                              next24Stats.trend == null
                                  ? "Trend —"
                                  : next24Stats.trend > 0.25
                                      ? `Trend ↑ ${next24Stats.trend.toFixed(1)}°C`
                                      : next24Stats.trend < -0.25
                                          ? `Trend ↓ ${Math.abs(next24Stats.trend).toFixed(1)}°C`
                                          : "Trend ~0°C"
                            }
                            variant="outlined"
                            color={next24Stats.trend != null && Math.abs(next24Stats.trend) > 2 ? "warning" : "default"}
                            sx={ellipsisChipSx}
                        />
                      </Stack>

                      <Stack direction="row" flexWrap="wrap" justifyContent="center" gap={1} useFlexGap sx={{ mt: 1 }}>
                        <Chip
                            size="small"
                            label={next24Stats.minT != null ? `Min @ ${fmtShortTime(next24Stats.minAt)}` : "Min @ —"}
                            variant="outlined"
                            sx={ellipsisChipSx}
                        />
                        <Chip
                            size="small"
                            label={next24Stats.maxT != null ? `Max @ ${fmtShortTime(next24Stats.maxAt)}` : "Max @ —"}
                            variant="outlined"
                            sx={ellipsisChipSx}
                        />
                      </Stack>
                    </>
                )}

                <Divider sx={{ opacity: 0.5, mt: 1, mb: 1 }} />

                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems="center" justifyContent="center" useFlexGap>
                  <FormControlLabel
                      control={<Switch checked={autoRefresh} onChange={(_, v) => setAutoRefresh(v)} />}
                      label={<Typography variant="body2">Auto refresh</Typography>}
                  />
                  <Stack direction="row" spacing={0.75} alignItems="center" justifyContent="center" useFlexGap sx={{ minWidth: 0 }}>
                    {[2, 5, 10, 15].map((m) => (
                        <Chip
                            key={m}
                            size="small"
                            label={`${m}m`}
                            color={autoRefreshMin === m ? "primary" : "default"}
                            variant="outlined"
                            onClick={() => setAutoRefreshMin(m)}
                            sx={{ cursor: "pointer", ...ellipsisChipSx }}
                            disabled={!autoRefresh}
                        />
                    ))}
                  </Stack>
                </Stack>
              </Box>
            </Stack>

            <Divider sx={{ opacity: 0.5, width: "100%" }} />

            <Stack spacing={1} sx={{ width: "100%", minWidth: 0, alignItems: "center" }}>
              <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" useFlexGap flexWrap="wrap" sx={{ width: "100%" }}>
                <Typography variant="subtitle2" fontWeight={950}>
                  Alert rules
                </Typography>
                <Button size="small" variant="outlined" onClick={() => setAlertsOpen((x) => !x)}>
                  {alertsOpen ? "Hide alerts" : "Show alerts"}
                </Button>
              </Stack>

              <Box
                  sx={{
                    width: "100%",
                    minWidth: 0,
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                    gap: 1,
                  }}
              >
                {alertRules.map((r) => {
                  const label = r.kind === "wind_gt" ? "Wind >" : "Temp <";
                  const unit = r.kind === "wind_gt" ? "m/s" : "°C";
                  const notifyIcon =
                      typeof Notification === "undefined" ? (
                          <NotificationsOffIcon fontSize="small" />
                      ) : r.notify ? (
                          <NotificationsActiveIcon fontSize="small" />
                      ) : (
                          <NotificationsOffIcon fontSize="small" />
                      );

                  return (
                      <Box
                          key={r.id}
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 1,
                            flexWrap: "wrap",
                            border: "1px solid rgba(37,243,225,0.12)",
                            borderRadius: 14,
                            p: 0.8,
                            background: "rgba(14, 18, 24, 0.45)",
                            overflow: "hidden",
                          }}
                      >
                        <Chip
                            size="small"
                            label={`${label} ${r.value} ${unit}`}
                            color={r.enabled ? "primary" : "default"}
                            variant="outlined"
                            onClick={() =>
                                setAlertRules((prev) => prev.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)))
                            }
                            sx={{ cursor: "pointer", ...ellipsisChipSx, maxWidth: "100%" }}
                        />
                        <TextField
                            size="small"
                            value={String(r.value)}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (!Number.isFinite(n)) return;
                              setAlertRules((prev) => prev.map((x) => (x.id === r.id ? { ...x, value: n } : x)));
                            }}
                            inputProps={{ inputMode: "decimal", style: { textAlign: "center" } }}
                            sx={{ width: 96 }}
                            disabled={!r.enabled}
                        />
                        <Tooltip
                            title={
                              typeof Notification === "undefined" ? "Notifications unsupported" : r.notify ? "Notifications on" : "Notifications off"
                            }
                        >
                      <span>
                        <IconButton
                            size="small"
                            color={r.notify ? "primary" : "default"}
                            disabled={!r.enabled || typeof Notification === "undefined"}
                            onClick={() =>
                                setAlertRules((prev) => prev.map((x) => (x.id === r.id ? { ...x, notify: !x.notify } : x)))
                            }
                        >
                          {notifyIcon}
                        </IconButton>
                      </span>
                        </Tooltip>
                        <Chip size="small" label={r.enabled ? "enabled" : "disabled"} variant="outlined" sx={ellipsisChipSx} />
                      </Box>
                  );
                })}
              </Box>

              <Collapse in={alertsOpen} timeout={180} unmountOnExit>
                <Box sx={{ mt: 1, width: "100%" }}>
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" useFlexGap flexWrap="wrap">
                    <Chip
                        size="small"
                        label={`Alerts ${alerts.length}`}
                        variant="outlined"
                        color={alerts.length ? "warning" : "default"}
                        sx={ellipsisChipSx}
                    />
                    <Button
                        size="small"
                        variant="outlined"
                        onClick={() => {
                          setAlerts([]);
                          setInfoSafe("Alerts cleared");
                        }}
                        disabled={!alerts.length}
                    >
                      Clear
                    </Button>
                  </Stack>

                  <Stack spacing={0.75} sx={{ mt: 1, alignItems: "center" }}>
                    {alerts.slice(0, 12).map((a) => (
                        <Box
                            key={a.id}
                            sx={{
                              width: "100%",
                              border: "1px solid rgba(255,255,255,0.08)",
                              borderRadius: 14,
                              p: 1,
                              background: "rgba(10,14,22,0.55)",
                              overflow: "hidden",
                            }}
                        >
                          <Typography variant="body2" sx={{ fontWeight: 900, wordBreak: "break-word" }}>
                            {a.city} · {a.severity.toUpperCase()}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ wordBreak: "break-word" }}>
                            {a.message}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {formatUpdated(a.ts)}
                          </Typography>
                        </Box>
                    ))}
                  </Stack>
                </Box>
              </Collapse>
            </Stack>
          </Stack>
        </WidgetCard>
    ),

    forecast: (
        <WidgetCard title="Forecast" right={rangeChips} bodySx={{ flex: 1 }}>
          <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
            <TempLineChart data={filteredForecast} />
          </Box>
        </WidgetCard>
    ),

    humidity: (
        <WidgetCard title="Humidity" right={rangeChips} bodySx={{ flex: 1 }}>
          <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
            <HumidityChart data={filteredForecast} />
          </Box>
        </WidgetCard>
    ),

    wind: (
        <WidgetCard title="Wind" right={rangeChips} bodySx={{ flex: 1 }}>
          <Box sx={{ flex: 1, minHeight: 0, display: "flex" }}>
            <WindChart data={filteredForecast} />
          </Box>
        </WidgetCard>
    ),

    pins: (
        <WidgetCard
            title="Pinned cities"
            scroll
            right={
              <Stack direction="row" spacing={1} alignItems="center" justifyContent="center">
                <Chip size="small" label={`${pins.length}/12`} variant="outlined" color="primary" sx={ellipsisChipSx} />
                <Button
                    size="small"
                    variant="outlined"
                    color="primary"
                    disabled={pins.length === 0}
                    onClick={clearPins}
                    sx={{ height: 30, px: 1.2, whiteSpace: "nowrap" }}
                >
                  Clear
                </Button>
              </Stack>
            }
        >
          <Stack spacing={1} sx={{ alignItems: "center" }}>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" justifyContent="center" useFlexGap sx={{ minWidth: 0 }}>
              {allGroups.map((g) => (
                  <Chip
                      key={g}
                      size="small"
                      label={g}
                      color={pinGroup === g ? "primary" : "default"}
                      variant="outlined"
                      onClick={() => setPinGroup(g)}
                      sx={{ cursor: "pointer", ...ellipsisChipSx }}
                  />
              ))}
            </Stack>

            <TextField
                size="small"
                value={pinFilter}
                onChange={(e) => setPinFilter(e.target.value)}
                placeholder="Filter pinned…"
                sx={{ width: "100%", maxWidth: 520 }}
                inputProps={{ style: { textAlign: "center" } }}
            />

            {pins.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                  Натисни 📌, щоб закріпити місто. Тут можна керувати: зробити дефолтним, перемістити, видалити.
                </Typography>
            )}

            {pins.length > 0 && filteredPins.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                  No matches.
                </Typography>
            )}

            {filteredPins.length > 0 && (
                <List dense sx={{ py: 0, width: "100%" }}>
                  {filteredPins.map((p) => {
                    const idx = pins.findIndex((x) => x.lat === p.lat && x.lon === p.lon);
                    const isDefault = !!defaultPin && defaultPin.lat === p.lat && defaultPin.lon === p.lon;
                    const pk = pinKey(p);
                    const pv = pinPreviews[pk];
                    const pvAge = pv ? formatUpdated(pv.updatedAt) : "—";

                    const previewChips = (
                        <Stack direction="row" spacing={0.75} flexWrap="wrap" justifyContent="center" useFlexGap sx={{ mt: 0.5 }}>
                          <Chip
                              size="small"
                              label={pv?.ok && pv.temp != null ? `T ${pv.temp.toFixed(1)}°C` : "T —"}
                              variant="outlined"
                              color={pv?.ok ? "primary" : "default"}
                              sx={ellipsisChipSx}
                          />
                          <Chip
                              size="small"
                              label={pv?.ok && pv.wind != null ? `W ${pv.wind.toFixed(1)} m/s` : "W —"}
                              variant="outlined"
                              color={pv?.ok ? "primary" : "default"}
                              sx={ellipsisChipSx}
                          />
                          <Chip size="small" label={pv ? pvAge : "preview —"} variant="outlined" sx={ellipsisChipSx} />
                          {p.group ? <Chip size="small" label={p.group} variant="outlined" sx={ellipsisChipSx} /> : null}
                        </Stack>
                    );

                    return (
                        <ListItem
                            key={`${p.lat}:${p.lon}`}
                            disableGutters
                            sx={{
                              border: "1px solid rgba(37,243,225,0.12)",
                              borderRadius: 14,
                              px: 1,
                              py: 0.5,
                              mb: 1,
                              background: "rgba(14, 18, 24, 0.45)",
                            }}
                            secondaryAction={
                              <Stack direction="row" spacing={0.5} alignItems="center">
                                <Tooltip title={isDefault ? "Default city" : "Set as default"}>
                                  <IconButton
                                      size="small"
                                      color="primary"
                                      onClick={() => {
                                        setDefaultPin(isDefault ? null : p);
                                        setInfoSafe(isDefault ? "Default removed" : `Default: ${p.name}`);
                                      }}
                                  >
                                    {isDefault ? <StarIcon fontSize="small" /> : <StarBorderIcon fontSize="small" />}
                                  </IconButton>
                                </Tooltip>

                                <Tooltip title="Move up">
                          <span>
                            <IconButton size="small" color="primary" disabled={idx <= 0} onClick={() => movePin(idx, -1)}>
                              <ArrowUpwardIcon fontSize="small" />
                            </IconButton>
                          </span>
                                </Tooltip>

                                <Tooltip title="Move down">
                          <span>
                            <IconButton
                                size="small"
                                color="primary"
                                disabled={idx < 0 || idx === pins.length - 1}
                                onClick={() => movePin(idx, 1)}
                            >
                              <ArrowDownwardIcon fontSize="small" />
                            </IconButton>
                          </span>
                                </Tooltip>

                                <Tooltip title="Unpin">
                                  <IconButton size="small" color="primary" onClick={() => unpin(p)}>
                                    <DeleteOutlineIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Stack>
                            }
                        >
                          <ListItemText
                              primary={
                                <Box onClick={() => void loadWeather(pinnedToGeo(p))} sx={{ cursor: "pointer", minWidth: 0, textAlign: "center" }}>
                                  <Typography fontWeight={900} sx={{ lineHeight: 1.2, wordBreak: "break-word" }}>
                                    {idx >= 0 ? `${idx + 1}. ` : ""}
                                    {p.name}
                                    {p.state ? `, ${p.state}` : ""} · {p.country}
                                  </Typography>
                                  <Typography variant="caption" color="text.secondary">
                                    {p.lat.toFixed(2)}, {p.lon.toFixed(2)}
                                  </Typography>
                                  {previewChips}
                                </Box>
                              }
                          />
                        </ListItem>
                    );
                  })}
                </List>
            )}

            {pins.length > 0 && (
                <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center" useFlexGap alignItems="center">
                  <Chip size="small" label="Set group for selected pin:" variant="outlined" sx={{ ...ellipsisChipSx, maxWidth: 240 }} />
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
                            setInfoSafe(g ? `Group set: ${g}` : "Group cleared");
                          }}
                          sx={{ cursor: "pointer", ...ellipsisChipSx }}
                          disabled={!selected || !pins.some((x) => x.lat === selected.lat && x.lon === selected.lon)}
                      />
                  ))}
                </Stack>
            )}
          </Stack>
        </WidgetCard>
    ),

    monitoring: (
        <WidgetCard title="Monitoring" scroll>
          <MonitoringPanel />
        </WidgetCard>
    ),
  };

  return (
      <Container maxWidth="xl" sx={{ py: { xs: 2, sm: 3, md: 4 } }}>
        <Stack spacing={{ xs: 1.5, sm: 2, md: 2.5 }} sx={{ alignItems: "center" }}>
          <Stack spacing={0.4} sx={{ textAlign: "center" }}>
            <Typography variant="h4">WeatherPulse</Typography>
            <Typography color="text.secondary">
              Dark gray UI · Neon turquoise accents · Responsive dashboard · Drag & drop blocks
            </Typography>
          </Stack>

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

                <Chip size="small" label={`Pinned ${pins.length}`} variant="outlined" color="primary" />

                <Button onClick={resetLayouts} startIcon={<RestartAltIcon />} variant="outlined" color="primary" sx={{ height: 44, whiteSpace: "nowrap" }}>
                  Reset layout
                </Button>
              </Stack>
            </Stack>
          </GlowCard>

          <Box sx={{ width: "100%" }}>
            <GridDashboard layouts={layouts} onLayoutsChange={setLayouts} childrenById={widgets} />
          </Box>

          <Snackbar open={!!error} autoHideDuration={3500} onClose={() => setError(null)}>
            <Alert severity="error" variant="filled" onClose={() => setError(null)}>
              {error}
            </Alert>
          </Snackbar>

          <Snackbar open={!!info} autoHideDuration={1800} onClose={() => setInfo(null)}>
            <Alert severity="success" variant="filled" onClose={() => setInfo(null)}>
              {info}
            </Alert>
          </Snackbar>
        </Stack>
      </Container>
  );
}

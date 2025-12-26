import { useCallback, useEffect, useMemo, useState } from "react";
import type { AlertEvent, AlertRule, CurrentWeather, ForecastPoint } from "../types";

const RULES_KEY = "weatherpulse:alertRules:v1";
const EVENTS_KEY = "weatherpulse:alertEvents:v1";

function loadJson<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

function saveJson<T>(key: string, value: T) {
    localStorage.setItem(key, JSON.stringify(value));
}

function uid() {
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function useAlerts() {
    const [rules, setRules] = useState<AlertRule[]>(() => {
        const saved = loadJson<AlertRule[]>(RULES_KEY, []);
        if (saved.length) return saved;

        const defaults: AlertRule[] = [
            { id: uid(), enabled: true, name: "Wind strong", type: "wind_gt", threshold: 12 },
            { id: uid(), enabled: true, name: "Temp below zero", type: "temp_lt", threshold: 0 },
            { id: uid(), enabled: true, name: "High precip probability", type: "pop_gt", threshold: 60 },
        ];
        saveJson(RULES_KEY, defaults);
        return defaults;
    });

    const [events, setEvents] = useState<AlertEvent[]>(() => loadJson<AlertEvent[]>(EVENTS_KEY, []));

    useEffect(() => saveJson(RULES_KEY, rules), [rules]);
    useEffect(() => saveJson(EVENTS_KEY, events), [events]);

    const pushEvent = useCallback((ev: AlertEvent) => {
        setEvents((prev) => [ev, ...prev].slice(0, 80));
    }, []);

    const requestDesktopPermission = useCallback(async () => {
        if (!("Notification" in window)) return "unsupported" as const;
        const p = await Notification.requestPermission();
        return p;
    }, []);

    const notify = useCallback((title: string, body: string) => {
        if (!("Notification" in window)) return;
        if (Notification.permission !== "granted") return;
        try {
            new Notification(title, { body });
        } catch {
            return;
        }
    }, []);

    const evaluate = useCallback(
        (args: { cityLabel: string; current: CurrentWeather | null; forecast: ForecastPoint[] }) => {
            const { cityLabel, current, forecast } = args;
            if (!current) return;

            const wind = Number.isFinite(current.wind?.speed) ? current.wind.speed : null;
            const temp = Number.isFinite(current.main?.temp) ? current.main.temp : null;
            const pop = forecast?.[0]?.pop != null ? Math.round((forecast[0].pop ?? 0) * 100) : null;

            const enabledRules = rules.filter((r) => r.enabled);

            for (const r of enabledRules) {
                let triggered = false;
                let valueText = "";
                let msg = "";

                if (r.type === "wind_gt" && wind != null && wind > r.threshold) {
                    triggered = true;
                    valueText = `${wind.toFixed(1)} m/s`;
                    msg = `Wind ${valueText} > ${r.threshold} m/s`;
                }

                if (r.type === "temp_lt" && temp != null && temp < r.threshold) {
                    triggered = true;
                    valueText = `${temp.toFixed(1)}°C`;
                    msg = `Temp ${valueText} < ${r.threshold}°C`;
                }

                if (r.type === "pop_gt" && pop != null && pop > r.threshold) {
                    triggered = true;
                    valueText = `${pop}%`;
                    msg = `Precip prob ${valueText} > ${r.threshold}%`;
                }

                if (!triggered) continue;

                const ev: AlertEvent = {
                    id: uid(),
                    ts: Date.now(),
                    cityLabel,
                    ruleId: r.id,
                    message: msg,
                    valueText,
                };

                pushEvent(ev);
                notify(`WeatherPulse • ${cityLabel}`, msg);
            }
        },
        [notify, pushEvent, rules]
    );

    const clearEvents = useCallback(() => setEvents([]), []);
    const removeRule = useCallback((id: string) => setRules((prev) => prev.filter((r) => r.id !== id)), []);
    const toggleRule = useCallback(
        (id: string) => setRules((prev) => prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))),
        []
    );
    const updateRule = useCallback(
        (id: string, patch: Partial<AlertRule>) =>
            setRules((prev) => prev.map((r) => (r.id === id ? ({ ...r, ...patch } as AlertRule) : r))),
        []
    );

    const addRule = useCallback((r: Omit<AlertRule, "id">) => setRules((prev) => [{ ...r, id: uid() } as AlertRule, ...prev]), []);

    const desktopStatus = useMemo(() => {
        if (!("Notification" in window)) return "unsupported" as const;
        return Notification.permission;
    }, []);

    return {
        rules,
        events,
        addRule,
        removeRule,
        toggleRule,
        updateRule,
        evaluate,
        clearEvents,
        desktopStatus,
        requestDesktopPermission,
    };
}

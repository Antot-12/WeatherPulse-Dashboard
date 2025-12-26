import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrent } from "../api";
import type { CurrentWeather } from "../types";

type Preview = {
    temp: number | null;
    wind: number | null;
    updatedAt: number;
};

const KEY = "weatherpulse:pinPreviews:v1";
const TTL_MS = 5 * 60_000;

function loadCache(): Record<string, Preview> {
    try {
        return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, Preview>;
    } catch {
        return {};
    }
}

function saveCache(v: Record<string, Preview>) {
    localStorage.setItem(KEY, JSON.stringify(v));
}

function k(lat: number, lon: number) {
    return `${lat.toFixed(4)}:${lon.toFixed(4)}`;
}

export function usePinPreviews(pins: Array<{ lat: number; lon: number }>, enabled: boolean) {
    const [cache, setCache] = useState<Record<string, Preview>>(() => loadCache());
    const inflight = useRef(new Set<string>());

    const keys = useMemo(() => pins.map((p) => k(p.lat, p.lon)), [pins]);

    useEffect(() => {
        if (!enabled) return;
        const now = Date.now();

        let cancelled = false;

        async function run() {

            const queue = pins.slice();
            const workers = [0, 1].map(async () => {
                while (queue.length && !cancelled) {
                    const p = queue.shift()!;
                    const key = k(p.lat, p.lon);

                    const entry = cache[key];
                    const fresh = entry && now - entry.updatedAt < TTL_MS;

                    if (fresh) continue;
                    if (inflight.current.has(key)) continue;

                    inflight.current.add(key);
                    try {
                        const cur = (await getCurrent(p.lat, p.lon, { timeoutMs: 9000 })) as CurrentWeather;
                        const temp = Number.isFinite(cur?.main?.temp) ? cur.main.temp : null;
                        const wind = Number.isFinite(cur?.wind?.speed) ? cur.wind.speed : null;

                        const next: Record<string, Preview> = { ...loadCache(), ...cache, [key]: { temp, wind, updatedAt: Date.now() } };
                        saveCache(next);
                        if (!cancelled) setCache(next);
                    } catch { /* empty */ } finally {
                        inflight.current.delete(key);
                    }
                }
            });

            await Promise.all(workers);
        }

        void run();
        return () => {
            cancelled = true;
        };

    }, [enabled, keys.join("|")]);

    return cache;
}

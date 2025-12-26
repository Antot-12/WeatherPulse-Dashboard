type FetchJsonOpts = {
    timeoutMs?: number;
    signal?: AbortSignal;
};

function withTimeout(timeoutMs: number | undefined, signal?: AbortSignal) {
    const ac = new AbortController();
    const onAbort = () => ac.abort();
    if (signal) {
        if (signal.aborted) ac.abort();
        else signal.addEventListener("abort", onAbort, { once: true });
    }
    const t = timeoutMs ? setTimeout(() => ac.abort(), timeoutMs) : null;
    return {
        signal: ac.signal,
        cleanup: () => {
            if (t) clearTimeout(t);
            if (signal) signal.removeEventListener("abort", onAbort);
        },
    };
}

export class OpenWeather {
    constructor(private apiKey: string) {}

    private async getJson(url: string, opts?: FetchJsonOpts): Promise<{ ok: boolean; status: number; data: any }> {
        const { signal, cleanup } = withTimeout(opts?.timeoutMs, opts?.signal);
        try {
            const res = await fetch(url, { signal });
            const status = res.status;
            let data: any = null;
            try {
                data = await res.json();
            } catch {
                data = null;
            }
            return { ok: res.ok, status, data };
        } finally {
            cleanup();
        }
    }

    geocode(q: string, limit = 6, opts?: FetchJsonOpts) {
        const url =
            `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=${limit}` +
            `&appid=${encodeURIComponent(this.apiKey)}`;
        return this.getJson(url, opts);
    }

    current(lat: number, lon: number, opts?: FetchJsonOpts) {
        const url =
            `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=metric` +
            `&appid=${encodeURIComponent(this.apiKey)}`;
        return this.getJson(url, opts);
    }

    forecast(lat: number, lon: number, opts?: FetchJsonOpts) {
        const url =
            `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric` +
            `&appid=${encodeURIComponent(this.apiKey)}`;
        return this.getJson(url, opts);
    }

    air(lat: number, lon: number, opts?: FetchJsonOpts) {
        const url =
            `https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}` +
            `&appid=${encodeURIComponent(this.apiKey)}`;
        return this.getJson(url, opts);
    }

    oneCall(lat: number, lon: number, opts?: FetchJsonOpts) {
        const url =
            `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=minutely,hourly,alerts&units=metric` +
            `&appid=${encodeURIComponent(this.apiKey)}`;
        return this.getJson(url, opts);
    }
}

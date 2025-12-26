import { useCallback, useEffect, useRef, useState } from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Chip from "@mui/material/Chip";
import { getIncidents } from "../api";
import type { IncidentItem } from "../types";

type IncidentsResponse = { items?: IncidentLike[] };

type IncidentLike = {
    ts?: number;
    status?: number;
    message?: string;
    error?: string;
    path?: string;
    route?: string;
    url?: string;
    method?: string;
};

function fmtTs(ts: number) {
    const d = new Date(ts);
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function isIncidentsResponse(x: unknown): x is IncidentsResponse {
    return !!x && typeof x === "object" && "items" in x;
}

function toIncidentItem(x: IncidentLike): IncidentItem {
    const tsN = Number(x.ts);
    const statusN = typeof x.status === "number" && Number.isFinite(x.status) ? x.status : 0;

    const basePath = x.path ?? x.route ?? x.url ?? "";
    const method = typeof x.method === "string" && x.method.trim() ? x.method.trim().toUpperCase() : "";
    const path = `${method ? `${method} ` : ""}${String(basePath)}`.trim();

    const msg = x.message ?? x.error ?? "";
    const message = String(msg);

    return {
        ts: Number.isFinite(tsN) ? tsN : Date.now(),
        status: statusN,
        path: path || "unknown",
        message: message || "Unknown error",
    };
}

function toErrorMessage(e: unknown) {
    if (e instanceof Error) return e.message;
    if (typeof e === "string") return e;
    return "Failed to load incidents";
}

export function IncidentsPanel({ clientErrors }: { clientErrors: string[] }) {
    const [items, setItems] = useState<IncidentItem[]>([]);
    const [err, setErr] = useState<string | null>(null);

    const aliveRef = useRef(true);
    useEffect(() => {
        aliveRef.current = true;
        return () => {
            aliveRef.current = false;
        };
    }, []);

    const refresh = useCallback(async () => {
        try {
            const x: unknown = await getIncidents();
            const raw = isIncidentsResponse(x) && Array.isArray(x.items) ? x.items : [];
            const next = raw.map((it) => toIncidentItem(it));
            if (!aliveRef.current) return;
            setItems(next);
            setErr(null);
        } catch (e: unknown) {
            if (!aliveRef.current) return;
            setErr(toErrorMessage(e));
        }
    }, []);

    useEffect(() => {
        const t = window.setTimeout(() => {
            void refresh();
        }, 0);

        const id = window.setInterval(() => {
            void refresh();
        }, 12_000);

        return () => {
            window.clearTimeout(t);
            window.clearInterval(id);
        };
    }, [refresh]);

    return (
        <Stack spacing={1.2}>
            <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
                <Chip size="small" label={`Server incidents ${items.length}`} variant="outlined" />
                <Chip
                    size="small"
                    label={`Client errors ${clientErrors.length}`}
                    variant="outlined"
                    color={clientErrors.length ? "warning" : "primary"}
                />
                <Button size="small" variant="outlined" onClick={() => void refresh()}>
                    Refresh
                </Button>
            </Stack>

            {err && (
                <Box sx={{ p: 1, borderRadius: 14, border: "1px solid rgba(255,80,80,0.22)", background: "rgba(60, 14, 14, 0.35)" }}>
                    <Typography variant="body2" sx={{ fontWeight: 900 }}>
                        {err}
                    </Typography>
                </Box>
            )}

            <Divider />

            <Typography variant="subtitle2" fontWeight={950}>
                Recent incidents
            </Typography>

            {items.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                    No incidents.
                </Typography>
            ) : (
                <Stack spacing={0.75}>
                    {items.slice(0, 25).map((it) => (
                        <Box
                            key={`${it.ts}:${it.path}`}
                            sx={{
                                border: "1px solid rgba(255,255,255,0.08)",
                                borderRadius: 14,
                                p: 1,
                                background: "rgba(10,14,22,0.55)",
                            }}
                        >
                            <Typography variant="body2" sx={{ fontWeight: 900 }}>
                                {it.status ? `[${it.status}] ` : ""}
                                {it.path}
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ wordBreak: "break-word" }}>
                                {it.message}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {fmtTs(it.ts)}
                            </Typography>
                        </Box>
                    ))}
                </Stack>
            )}

            <Divider />

            <Typography variant="subtitle2" fontWeight={950}>
                Client last errors
            </Typography>

            {clientErrors.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                    No client errors.
                </Typography>
            ) : (
                <Stack spacing={0.6}>
                    {clientErrors.slice(0, 25).map((m, i) => (
                        <Typography key={`${i}:${m}`} variant="body2" color="text.secondary" sx={{ fontWeight: 800 }}>
                            • {m}
                        </Typography>
                    ))}
                </Stack>
            )}
        </Stack>
    );
}

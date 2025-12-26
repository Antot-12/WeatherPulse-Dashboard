import { useMemo, useState } from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Chip from "@mui/material/Chip";
import TextField from "@mui/material/TextField";
import Switch from "@mui/material/Switch";
import FormControlLabel from "@mui/material/FormControlLabel";
import type { AlertRule } from "../types";
import IconButton from "@mui/material/IconButton";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

function fmtTs(ts: number) {
    const d = new Date(ts);
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function AlertsPanel({
                                alerts,
                            }: {
    alerts: ReturnType<typeof import("../hooks/useAlerts").useAlerts>;
}) {
    const { rules, events, addRule, removeRule, toggleRule, updateRule, clearEvents, desktopStatus, requestDesktopPermission } = alerts;

    const [newWind, setNewWind] = useState(12);
    const [newTemp, setNewTemp] = useState(0);
    const [newPop, setNewPop] = useState(60);

    const enabledCount = useMemo(() => rules.filter((r) => r.enabled).length, [rules]);

    return (
        <Stack spacing={1.4} sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center" useFlexGap>
                <Chip size="small" label={`Rules ${enabledCount}/${rules.length}`} variant="outlined" color="primary" />
                <Chip size="small" label={`Desktop: ${desktopStatus}`} variant="outlined" />
                {desktopStatus !== "granted" && desktopStatus !== "unsupported" && (
                    <Button size="small" variant="outlined" onClick={() => void requestDesktopPermission()}>
                        Enable notifications
                    </Button>
                )}
                <Box sx={{ flex: 1 }} />
                <Button size="small" variant="outlined" color="primary" onClick={clearEvents} disabled={!events.length}>
                    Clear alerts
                </Button>
            </Stack>

            <Divider />

            <Typography variant="subtitle2" fontWeight={950}>
                Rules
            </Typography>

            <Stack spacing={1}>
                {rules.map((r) => (
                    <Box
                        key={r.id}
                        sx={{
                            border: "1px solid rgba(37,243,225,0.12)",
                            borderRadius: 14,
                            p: 1,
                            background: "rgba(14, 18, 24, 0.45)",
                            display: "flex",
                            gap: 1,
                            alignItems: "center",
                            minWidth: 0,
                        }}
                    >
                        <FormControlLabel control={<Switch checked={r.enabled} onChange={() => toggleRule(r.id)} />} label={<Typography variant="body2" sx={{ fontWeight: 900 }}>{r.name}</Typography>} />
                        <Box sx={{ flex: 1 }} />

                        <TextField
                            size="small"
                            type="number"
                            value={r.threshold}
                            onChange={(e) => updateRule(r.id, { threshold: Number(e.target.value) } as Partial<AlertRule>)}
                            sx={{ width: 110 }}
                            inputProps={{ step: 1 }}
                        />

                        <IconButton size="small" color="primary" onClick={() => removeRule(r.id)}>
                            <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                    </Box>
                ))}
            </Stack>

            <Divider />

            <Typography variant="subtitle2" fontWeight={950}>
                Quick add
            </Typography>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap>
                <Button
                    variant="outlined"
                    onClick={() => addRule({ enabled: true, name: `Wind > ${newWind}`, type: "wind_gt", threshold: newWind })}
                >
                    Add wind
                </Button>
                <TextField size="small" type="number" value={newWind} onChange={(e) => setNewWind(Number(e.target.value))} sx={{ width: 110 }} />

                <Button
                    variant="outlined"
                    onClick={() => addRule({ enabled: true, name: `Temp < ${newTemp}`, type: "temp_lt", threshold: newTemp })}
                >
                    Add temp
                </Button>
                <TextField size="small" type="number" value={newTemp} onChange={(e) => setNewTemp(Number(e.target.value))} sx={{ width: 110 }} />

                <Button
                    variant="outlined"
                    onClick={() => addRule({ enabled: true, name: `POP > ${newPop}%`, type: "pop_gt", threshold: newPop })}
                >
                    Add POP
                </Button>
                <TextField size="small" type="number" value={newPop} onChange={(e) => setNewPop(Number(e.target.value))} sx={{ width: 110 }} />
            </Stack>

            <Divider />

            <Typography variant="subtitle2" fontWeight={950}>
                Alerts list
            </Typography>

            {events.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                    No alerts yet. (Rules are evaluated on each refresh/auto-refresh.)
                </Typography>
            ) : (
                <Stack spacing={0.75}>
                    {events.slice(0, 30).map((ev) => (
                        <Box key={ev.id} sx={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, p: 1, background: "rgba(10,14,22,0.55)" }}>
                            <Typography variant="body2" sx={{ fontWeight: 900 }}>
                                {ev.cityLabel} — {ev.message}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {fmtTs(ev.ts)}
                            </Typography>
                        </Box>
                    ))}
                </Stack>
            )}
        </Stack>
    );
}

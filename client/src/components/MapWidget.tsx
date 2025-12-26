import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

type LeafletIconProtoWithGetIconUrl = L.Icon.Default & {
    _getIconUrl?: unknown;
};

const proto = L.Icon.Default.prototype as LeafletIconProtoWithGetIconUrl;
if ("_getIconUrl" in proto) {
    delete proto._getIconUrl;
}

L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export function MapWidget(props: {
    selected: { label: string; lat: number; lon: number } | null;
    pins: Array<{ label: string; lat: number; lon: number }>;
    onPick: (lat: number, lon: number) => void;
}) {
    const { selected, pins, onPick } = props;

    const center = useMemo(() => {
        if (selected) return [selected.lat, selected.lon] as [number, number];
        if (pins.length) return [pins[0].lat, pins[0].lon] as [number, number];
        return [50.088, 14.42] as [number, number];
    }, [pins, selected]);

    return (
        <Box sx={{ flex: 1, minHeight: 0, height: "100%" }}>
            <MapContainer center={center} zoom={selected ? 9 : 5} style={{ width: "100%", height: "100%", borderRadius: 14 }}>
                <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

                {selected && (
                    <Marker position={[selected.lat, selected.lon]}>
                        <Popup>
                            <Typography fontWeight={900}>{selected.label}</Typography>
                            <Typography variant="caption">
                                {selected.lat.toFixed(3)}, {selected.lon.toFixed(3)}
                            </Typography>
                        </Popup>
                    </Marker>
                )}

                {pins.map((p) => (
                    <Marker
                        key={`${p.lat}:${p.lon}`}
                        position={[p.lat, p.lon]}
                        eventHandlers={{
                            click: () => onPick(p.lat, p.lon),
                        }}
                    >
                        <Popup>
                            <Typography fontWeight={900}>{p.label}</Typography>
                            <Typography variant="caption">Click marker to load</Typography>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>
        </Box>
    );
}

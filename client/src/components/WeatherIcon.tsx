import Box from "@mui/material/Box";
import { keyframes } from "@mui/material/styles";

type Props = {
  code?: string | null;
  size?: number;
  animated?: boolean;
};

const float = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
`;

// Map OpenWeather icon codes to emoji + description
const ICON_MAP: Record<string, { emoji: string; label: string; color: string }> = {
  // Clear
  "01d": { emoji: "☀️", label: "Clear sky", color: "#FACC15" },
  "01n": { emoji: "🌙", label: "Clear night", color: "#A5B4FC" },
  // Few clouds
  "02d": { emoji: "⛅", label: "Few clouds", color: "#FCD34D" },
  "02n": { emoji: "☁️", label: "Few clouds", color: "#94A3B8" },
  // Scattered clouds
  "03d": { emoji: "☁️", label: "Scattered clouds", color: "#CBD5E1" },
  "03n": { emoji: "☁️", label: "Scattered clouds", color: "#94A3B8" },
  // Broken clouds
  "04d": { emoji: "☁️", label: "Broken clouds", color: "#94A3B8" },
  "04n": { emoji: "☁️", label: "Broken clouds", color: "#64748B" },
  // Shower rain
  "09d": { emoji: "🌧️", label: "Shower rain", color: "#38BDF8" },
  "09n": { emoji: "🌧️", label: "Shower rain", color: "#0EA5E9" },
  // Rain
  "10d": { emoji: "🌦️", label: "Rain", color: "#60A5FA" },
  "10n": { emoji: "🌧️", label: "Rain", color: "#3B82F6" },
  // Thunderstorm
  "11d": { emoji: "⛈️", label: "Thunderstorm", color: "#A78BFA" },
  "11n": { emoji: "⛈️", label: "Thunderstorm", color: "#8B5CF6" },
  // Snow
  "13d": { emoji: "❄️", label: "Snow", color: "#E0F2FE" },
  "13n": { emoji: "❄️", label: "Snow", color: "#BAE6FD" },
  // Mist/Fog
  "50d": { emoji: "🌫️", label: "Mist", color: "#CBD5E1" },
  "50n": { emoji: "🌫️", label: "Mist", color: "#94A3B8" },
};

const DEFAULT_ICON = { emoji: "🌡️", label: "Weather", color: "#25F3E1" };

export function WeatherIcon({ code, size = 64, animated = true }: Props) {
  const icon = code ? ICON_MAP[code] ?? DEFAULT_ICON : DEFAULT_ICON;

  const isSunny = code === "01d";
  const isRainy = code?.startsWith("09") || code?.startsWith("10");
  const isStormy = code?.startsWith("11");
  const isSnowy = code?.startsWith("13");

  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        width: size,
        height: size,
        fontSize: size * 0.7,
        lineHeight: 1,
        animation: animated ? `${float} 3s ease-in-out infinite` : "none",
        filter: `drop-shadow(0 0 ${size * 0.15}px ${icon.color}40)`,
        transition: "all 0.3s ease",
        "&:hover": {
          transform: "scale(1.1)",
          filter: `drop-shadow(0 0 ${size * 0.25}px ${icon.color}60)`,
        },
      }}
      title={icon.label}
    >
      {/* Background glow effect */}
      {isSunny && (
        <Box
          sx={{
            position: "absolute",
            width: "120%",
            height: "120%",
            borderRadius: "50%",
            background: `radial-gradient(circle, ${icon.color}30 0%, transparent 70%)`,
            animation: `${pulse} 2s ease-in-out infinite`,
          }}
        />
      )}

      {/* Rain drops effect */}
      {isRainy && animated && (
        <Box
          sx={{
            position: "absolute",
            bottom: -4,
            left: "50%",
            transform: "translateX(-50%)",
            width: "60%",
            height: 8,
            display: "flex",
            gap: "4px",
            justifyContent: "center",
          }}
        >
          {[0, 1, 2].map((i) => (
            <Box
              key={i}
              sx={{
                width: 2,
                height: 6,
                borderRadius: 1,
                background: "#60A5FA",
                animation: `${pulse} 0.8s ease-in-out infinite`,
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </Box>
      )}

      {/* Snow flakes effect */}
      {isSnowy && animated && (
        <Box
          sx={{
            position: "absolute",
            bottom: -8,
            left: "50%",
            transform: "translateX(-50%)",
            fontSize: size * 0.15,
            display: "flex",
            gap: "2px",
          }}
        >
          {["❄", "❄", "❄"].map((s, i) => (
            <Box
              key={i}
              component="span"
              sx={{
                animation: `${pulse} 1.2s ease-in-out infinite`,
                animationDelay: `${i * 0.3}s`,
                opacity: 0.7,
              }}
            >
              {s}
            </Box>
          ))}
        </Box>
      )}

      {/* Lightning effect */}
      {isStormy && animated && (
        <Box
          sx={{
            position: "absolute",
            bottom: -2,
            left: "55%",
            fontSize: size * 0.25,
            animation: `${pulse} 0.5s ease-in-out infinite`,
          }}
        >
          ⚡
        </Box>
      )}

      {/* Main emoji */}
      <Box component="span" sx={{ position: "relative", zIndex: 1 }}>
        {icon.emoji}
      </Box>
    </Box>
  );
}

// Alternative: Use OpenWeather's official icons
export function WeatherIconImg({ code, size = 64 }: Props) {
  if (!code) return null;

  const url = `https://openweathermap.org/img/wn/${code}@2x.png`;

  return (
    <Box
      component="img"
      src={url}
      alt="Weather"
      sx={{
        width: size,
        height: size,
        filter: "drop-shadow(0 0 8px rgba(37, 243, 225, 0.3))",
        animation: `${float} 3s ease-in-out infinite`,
      }}
    />
  );
}

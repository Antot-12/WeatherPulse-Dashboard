import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import { keyframes } from "@mui/material/styles";

import SearchIcon from "@mui/icons-material/Search";
import CloudOffIcon from "@mui/icons-material/CloudOff";
import WifiOffIcon from "@mui/icons-material/WifiOff";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ExploreIcon from "@mui/icons-material/Explore";

const float = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
`;

const pulse = keyframes`
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
`;

const bounce = keyframes`
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
`;

type EmptyStateProps = {
  type: "no-city" | "no-data" | "error" | "offline" | "no-pins";
  message?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  suggestions?: string[];
};

const STATES = {
  "no-city": {
    icon: <SearchIcon sx={{ fontSize: 64 }} />,
    title: "Search for a city",
    description: "Enter a city name above to see current weather and forecasts",
    color: "#25F3E1",
  },
  "no-data": {
    icon: <CloudOffIcon sx={{ fontSize: 64 }} />,
    title: "No weather data",
    description: "Unable to load weather information for this location",
    color: "#94A3B8",
  },
  error: {
    icon: <ErrorOutlineIcon sx={{ fontSize: 64 }} />,
    title: "Something went wrong",
    description: "We couldn't load the data. Please try again.",
    color: "#F87171",
  },
  offline: {
    icon: <WifiOffIcon sx={{ fontSize: 64 }} />,
    title: "You're offline",
    description: "Check your internet connection and try again",
    color: "#FBBF24",
  },
  "no-pins": {
    icon: <ExploreIcon sx={{ fontSize: 64 }} />,
    title: "No pinned cities yet",
    description: "Pin your favorite cities for quick access",
    color: "#A78BFA",
  },
};

export function EmptyState({ type, message, action, suggestions }: EmptyStateProps) {
  const state = STATES[type];

  return (
    <Stack
      spacing={2}
      alignItems="center"
      justifyContent="center"
      sx={{
        py: 4,
        px: 2,
        textAlign: "center",
        minHeight: 200,
      }}
    >
      {/* Animated icon */}
      <Box
        sx={{
          color: state.color,
          animation: `${float} 3s ease-in-out infinite`,
          filter: `drop-shadow(0 0 20px ${state.color}40)`,
        }}
      >
        {state.icon}
      </Box>

      {/* Title */}
      <Typography
        variant="h6"
        sx={{
          fontWeight: 900,
          color: "rgba(255,255,255,0.9)",
        }}
      >
        {state.title}
      </Typography>

      {/* Description */}
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ maxWidth: 280 }}
      >
        {message ?? state.description}
      </Typography>

      {/* Suggestions */}
      {suggestions && suggestions.length > 0 && (
        <Stack spacing={0.5} sx={{ mt: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Try searching for:
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center">
            {suggestions.map((s) => (
              <Box
                key={s}
                sx={{
                  px: 1.5,
                  py: 0.5,
                  borderRadius: 12,
                  border: "1px solid rgba(37,243,225,0.2)",
                  background: "rgba(37,243,225,0.05)",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.8)",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  "&:hover": {
                    background: "rgba(37,243,225,0.12)",
                    borderColor: "rgba(37,243,225,0.35)",
                  },
                }}
              >
                {s}
              </Box>
            ))}
          </Stack>
        </Stack>
      )}

      {/* Action button */}
      {action && (
        <Button
          variant="outlined"
          color="primary"
          onClick={action.onClick}
          sx={{
            mt: 1,
            animation: `${pulse} 2s ease-in-out infinite`,
          }}
        >
          {action.label}
        </Button>
      )}

      {/* Decorative elements */}
      <Box
        sx={{
          position: "absolute",
          width: 200,
          height: 200,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${state.color}08 0%, transparent 70%)`,
          pointerEvents: "none",
          animation: `${bounce} 4s ease-in-out infinite`,
        }}
      />
    </Stack>
  );
}

// Inline empty state for smaller areas (like inside cards)
export function EmptyStateInline({
  icon,
  text,
  subtext,
}: {
  icon?: React.ReactNode;
  text: string;
  subtext?: string;
}) {
  return (
    <Stack
      spacing={1}
      alignItems="center"
      justifyContent="center"
      sx={{
        py: 3,
        px: 2,
        textAlign: "center",
        opacity: 0.8,
      }}
    >
      {icon && (
        <Box sx={{ color: "rgba(37,243,225,0.5)", fontSize: 32 }}>
          {icon}
        </Box>
      )}
      <Typography variant="body2" fontWeight={700} color="text.secondary">
        {text}
      </Typography>
      {subtext && (
        <Typography variant="caption" color="text.secondary">
          {subtext}
        </Typography>
      )}
    </Stack>
  );
}

// Pulsing placeholder for charts
export function ChartPlaceholder({ height = 200 }: { height?: number }) {
  return (
    <Box
      sx={{
        width: "100%",
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Animated placeholder line */}
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 400 100"
        preserveAspectRatio="none"
        style={{ position: "absolute" }}
      >
        <defs>
          <linearGradient id="placeholderGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(37,243,225,0.1)" />
            <stop offset="50%" stopColor="rgba(37,243,225,0.25)" />
            <stop offset="100%" stopColor="rgba(37,243,225,0.1)" />
          </linearGradient>
        </defs>
        <path
          d="M 0 70 Q 50 40, 100 55 T 200 45 T 300 60 T 400 35"
          fill="none"
          stroke="url(#placeholderGrad)"
          strokeWidth="3"
          strokeLinecap="round"
          style={{
            animation: `${pulse} 1.5s ease-in-out infinite`,
          }}
        />
        <path
          d="M 0 70 Q 50 40, 100 55 T 200 45 T 300 60 T 400 35 L 400 100 L 0 100 Z"
          fill="rgba(37,243,225,0.05)"
          style={{
            animation: `${pulse} 1.5s ease-in-out infinite`,
          }}
        />
      </svg>

      <Typography
        variant="body2"
        color="text.secondary"
        sx={{
          position: "relative",
          zIndex: 1,
          fontWeight: 700,
          animation: `${pulse} 1.5s ease-in-out infinite`,
        }}
      >
        Loading chart data...
      </Typography>
    </Box>
  );
}

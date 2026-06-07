import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { keyframes } from "@mui/material/styles";

const shimmer = keyframes`
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
`;

const pulse = keyframes`
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.7; }
`;

const wave = keyframes`
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
`;

type SkeletonBoxProps = {
  width?: number | string;
  height?: number | string;
  borderRadius?: number | string;
  variant?: "rectangular" | "circular" | "text";
};

function SkeletonBox({
  width = "100%",
  height = 20,
  borderRadius = 8,
  variant = "rectangular",
}: SkeletonBoxProps) {
  const br = variant === "circular" ? "50%" : variant === "text" ? 4 : borderRadius;

  return (
    <Box
      sx={{
        width,
        height,
        borderRadius: br,
        background: "linear-gradient(90deg, rgba(37,243,225,0.05) 0%, rgba(37,243,225,0.12) 50%, rgba(37,243,225,0.05) 100%)",
        backgroundSize: "200% 100%",
        animation: `${shimmer} 1.5s ease-in-out infinite`,
        position: "relative",
        overflow: "hidden",
      }}
    />
  );
}

// Skeleton for current weather display
export function WeatherSkeleton() {
  return (
    <Stack spacing={2} alignItems="center" sx={{ py: 2 }}>
      {/* Weather icon placeholder */}
      <SkeletonBox width={80} height={80} variant="circular" />

      {/* Temperature */}
      <SkeletonBox width={140} height={48} borderRadius={12} />

      {/* Location */}
      <SkeletonBox width={200} height={20} />

      {/* Stats row */}
      <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="center">
        <SkeletonBox width={100} height={32} borderRadius={16} />
        <SkeletonBox width={120} height={32} borderRadius={16} />
        <SkeletonBox width={90} height={32} borderRadius={16} />
      </Stack>
    </Stack>
  );
}

// Skeleton for chart area
export function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <Box
      sx={{
        width: "100%",
        height,
        position: "relative",
        overflow: "hidden",
        borderRadius: 2,
        background: "rgba(14, 18, 24, 0.4)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        gap: 1,
        p: 2,
      }}
    >
      {/* Animated bars to simulate chart loading */}
      {Array.from({ length: 12 }).map((_, i) => (
        <Box
          key={i}
          sx={{
            width: "6%",
            height: `${30 + Math.random() * 50}%`,
            borderRadius: "4px 4px 0 0",
            background: "rgba(37, 243, 225, 0.15)",
            animation: `${pulse} 1.2s ease-in-out infinite`,
            animationDelay: `${i * 0.1}s`,
          }}
        />
      ))}

      {/* Shimmer overlay */}
      <Box
        sx={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "linear-gradient(90deg, transparent 0%, rgba(37,243,225,0.08) 50%, transparent 100%)",
          animation: `${wave} 2s ease-in-out infinite`,
        }}
      />
    </Box>
  );
}

// Skeleton for pinned city card
export function PinnedCitySkeleton() {
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 14,
        border: "1px solid rgba(37,243,225,0.12)",
        background: "rgba(14, 18, 24, 0.45)",
      }}
    >
      <Stack direction="row" spacing={2} alignItems="center">
        <SkeletonBox width={40} height={40} variant="circular" />
        <Stack spacing={0.5} flex={1}>
          <SkeletonBox width="60%" height={16} />
          <SkeletonBox width="40%" height={12} />
        </Stack>
        <SkeletonBox width={60} height={28} borderRadius={14} />
      </Stack>
    </Box>
  );
}

// Skeleton for stats grid
export function StatsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Box
      sx={{
        display: "grid",
        gap: 1,
        gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))",
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Box
          key={i}
          sx={{
            p: 1.5,
            borderRadius: 14,
            border: "1px solid rgba(37,243,225,0.08)",
            background: "rgba(14, 18, 24, 0.35)",
          }}
        >
          <Stack spacing={1} alignItems="center">
            <SkeletonBox width="70%" height={12} />
            <SkeletonBox width="50%" height={20} />
          </Stack>
        </Box>
      ))}
    </Box>
  );
}

// Full widget skeleton
export function WidgetSkeleton({
  title = true,
  chart = false,
  stats = false,
  height,
}: {
  title?: boolean;
  chart?: boolean;
  stats?: boolean;
  height?: number;
}) {
  return (
    <Box
      sx={{
        height: height ?? "100%",
        p: 2,
        borderRadius: 18,
        border: "1px solid rgba(37,243,225,0.12)",
        background: "rgba(14, 18, 24, 0.94)",
      }}
    >
      <Stack spacing={2} height="100%">
        {title && (
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <SkeletonBox width={120} height={24} borderRadius={8} />
            <SkeletonBox width={80} height={28} borderRadius={14} />
          </Stack>
        )}

        {chart && (
          <Box flex={1}>
            <ChartSkeleton height={height ? height - 80 : 180} />
          </Box>
        )}

        {stats && <StatsGridSkeleton count={4} />}

        {!chart && !stats && (
          <Stack spacing={1.5} flex={1}>
            <SkeletonBox width="100%" height={40} />
            <SkeletonBox width="80%" height={40} />
            <SkeletonBox width="90%" height={40} />
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

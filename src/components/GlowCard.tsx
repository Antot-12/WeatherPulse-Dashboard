import Paper from "@mui/material/Paper";
import { styled } from "@mui/material/styles";

type GlowCardOwnerState = {
  interactive?: boolean;
  selected?: boolean;
  disabled?: boolean;
  dense?: boolean;
  padding?: number;
  radius?: number;
  hoverLift?: number;
  hoverBorderAlpha?: number;
  hoverGlowAlpha?: number;
};

export const GlowCard = styled(Paper, {
  shouldForwardProp: (prop) =>
      prop !== "interactive" &&
      prop !== "selected" &&
      prop !== "disabled" &&
      prop !== "dense" &&
      prop !== "padding" &&
      prop !== "radius" &&
      prop !== "hoverLift" &&
      prop !== "hoverBorderAlpha" &&
      prop !== "hoverGlowAlpha",
})<GlowCardOwnerState>(
    ({
       theme,
       interactive = true,
       selected = false,
       disabled = false,
       dense = false,
       padding,
       radius,
       hoverLift = 2,
       hoverBorderAlpha = 0.24,
       hoverGlowAlpha = 0.1,
     }) => {
      const pad = typeof padding === "number" ? padding : dense ? 12 : 16;
      const rad = typeof radius === "number" ? radius : theme.shape.borderRadius;

      const baseBorder = selected ? "rgba(37,243,225,0.28)" : "rgba(37,243,225,0.12)";
      const baseShadow =
          selected
              ? "0 18px 55px rgba(0,0,0,0.58), 0 0 0 1px rgba(37,243,225,0.14) inset, 0 0 26px rgba(37,243,225,0.09)"
              : "0 18px 55px rgba(0,0,0,0.58), 0 0 0 1px rgba(255,255,255,0.03) inset, 0 0 24px rgba(37,243,225,0.07)";

      const hoverShadow = `0 20px 60px rgba(0,0,0,0.60), 0 0 28px rgba(37,243,225,${hoverGlowAlpha}), 0 0 0 1px rgba(255,255,255,0.03) inset`;

      return {
        padding: pad,
        borderRadius: rad,
        position: "relative",
        overflow: "hidden",
        border: `1px solid ${baseBorder}`,
        boxShadow: baseShadow,
        outline: 0,
        opacity: disabled ? 0.72 : 1,
        pointerEvents: disabled ? "none" : "auto",
        transition: "transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, opacity 160ms ease",
        ...(interactive && !disabled
            ? {
              "&:hover": {
                transform: `translateY(-${hoverLift}px)`,
                borderColor: `rgba(37,243,225,${hoverBorderAlpha})`,
                boxShadow: hoverShadow,
              },
              "&:active": {
                transform: "translateY(0px)",
              },
              "&:focus-visible": {
                borderColor: "rgba(37,243,225,0.38)",
                boxShadow:
                    "0 18px 55px rgba(0,0,0,0.58), 0 0 0 1px rgba(37,243,225,0.22) inset, 0 0 0 3px rgba(37,243,225,0.14)",
              },
            }
            : {}),
      };
    }
);

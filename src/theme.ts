import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#25F3E1" },
    background: {
      default: "#0B0F14",
      paper: "rgba(14, 18, 24, 0.94)",
    },
    text: {
      primary: "rgba(255,255,255,0.92)",
      secondary: "rgba(255,255,255,0.66)",
    },
    divider: "rgba(37,243,225,0.14)",
  },
  shape: { borderRadius: 18 },
  typography: {
    fontFamily:
      'Inter, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif',
    h4: { fontWeight: 900, letterSpacing: -0.5 },
    h6: { fontWeight: 900, letterSpacing: -0.2 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        html: { colorScheme: "dark" },
        body: { background: "#0B0F14", minHeight: "100vh" },
        "*::-webkit-scrollbar": { width: 10, height: 10 },
        "*::-webkit-scrollbar-thumb": {
          background: "rgba(37,243,225,0.22)",
          borderRadius: 10,
          border: "2px solid rgba(14,18,24,0.94)",
        },
        "*::-webkit-scrollbar-thumb:hover": { background: "rgba(37,243,225,0.35)" },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          border: "1px solid rgba(37,243,225,0.12)",
          boxShadow:
            "0 18px 55px rgba(0,0,0,0.58), 0 0 0 1px rgba(255,255,255,0.03) inset, 0 0 24px rgba(37,243,225,0.07)",
          backdropFilter: "blur(14px)",
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          backgroundColor: "rgba(14, 18, 24, 0.62)",
        },
        notchedOutline: {
          borderColor: "rgba(37,243,225,0.18)",
        },
        input: {
          color: "rgba(255,255,255,0.92)",
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { color: "rgba(255,255,255,0.72)" },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 900,
          borderRadius: 14,
          paddingInline: 14,
          paddingBlock: 10,
        },
        containedPrimary: {
          boxShadow: "0 0 0 1px rgba(37,243,225,0.22), 0 0 28px rgba(37,243,225,0.18)",
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: 14,
          border: "1px solid rgba(37,243,225,0.12)",
          backgroundColor: "rgba(14, 18, 24, 0.55)",
        },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        paper: {
          backgroundColor: "rgba(14, 18, 24, 0.98)",
          border: "1px solid rgba(37,243,225,0.14)",
        },
        listbox: {
          padding: 6,
        },
        option: {
          borderRadius: 12,
          padding: "10px 10px",
          color: "rgba(255,255,255,0.90)",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          borderColor: "rgba(37,243,225,0.22)",
          backgroundColor: "rgba(14, 18, 24, 0.62)",
        },
      },
    },
  },
});

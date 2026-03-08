export const theme = {
  colors: {
    bg: "#0a0a0f",
    bgCard: "#12121a",
    bgHover: "#1a1a28",
    border: "#2a2a3a",
    text: "#e0e0e8",
    textMuted: "#8888a0",
    primary: "#7c6cff",
    primaryHover: "#9a8cff",
    accent: "#ff6c8c",
    success: "#4cda8c",
    warning: "#ffc66c",
    danger: "#ff5c5c",
    // Cluster colors for scatter plot
    cluster: [
      "#7c6cff", "#ff6c8c", "#4cda8c", "#ffc66c", "#6cc8ff",
      "#ff9c6c", "#c86cff", "#6cffcc", "#ff6cdc", "#8cff6c",
    ],
    outlier: "#ff5c5c",
  },
  spacing: {
    xs: "4px",
    sm: "8px",
    md: "16px",
    lg: "24px",
    xl: "32px",
    xxl: "48px",
  },
  radius: {
    sm: "4px",
    md: "8px",
    lg: "12px",
  },
  fontSize: {
    xs: "11px",
    sm: "13px",
    md: "15px",
    lg: "18px",
    xl: "24px",
    xxl: "32px",
  },
} as const;

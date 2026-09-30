/** The dashboard's only colours: a fixed dark palette, the same in every terminal. */
export const THEME = {
  background: "#0e1116",
  panel: "#12161d",
  border: "#2b313c",
  focus: "#5fb3c7",
  text: "#d5d9e0",
  muted: "#7c8594",
  faint: "#4a5261",
  accent: "#5fb3c7",
  success: "#8cc265",
  warning: "#e2b861",
  danger: "#e06c6c",
  info: "#6ea7e6",
  selection: "#1f3a47",
  onBadge: "#0e1116",
} as const;

export type ThemeColor = keyof typeof THEME;

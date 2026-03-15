import type { CSSProperties } from "react";

export const mono = (color: string, size?: string): CSSProperties => ({
  color,
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: size,
});

// Ticker / detail text
export const FONT_XS = "clamp(8px, 1.2vw, 11px)";
export const FONT_SM = "clamp(9px, 1.2vw, 12px)";
export const FONT_MD = "clamp(9px, 1.3vw, 13px)";
export const FONT_LG = "clamp(10px, 1.4vw, 13px)";

// UI controls / buttons / legend
export const FONT_BTN = "clamp(10px, 1.5vw, 14px)";
export const FONT_ICON = "clamp(12px, 1.8vw, 16px)";

// Header
export const FONT_TITLE = "clamp(14px, 3vw, 24px)";
export const FONT_SUBTITLE = "clamp(10px, 1.8vw, 16px)";
export const FONT_CLOCK = "clamp(11px, 1.5vw, 15px)";

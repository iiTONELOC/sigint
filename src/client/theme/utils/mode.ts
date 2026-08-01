import { ThemeMode, type ResolvedThemeMode } from "../model";

enum ThemePreferenceMediaQuery {
  Light = "(prefers-color-scheme: light)",
}

export function resolveThemeMode(mode: ThemeMode): ResolvedThemeMode {
  if (mode !== ThemeMode.Auto) return mode;
  if (typeof window === "undefined") return ThemeMode.Dark;
  return window.matchMedia(ThemePreferenceMediaQuery.Light).matches
    ? ThemeMode.Light
    : ThemeMode.Dark;
}

export function systemThemeMediaQuery(): MediaQueryList | null {
  return typeof window === "undefined"
    ? null
    : window.matchMedia(ThemePreferenceMediaQuery.Light);
}

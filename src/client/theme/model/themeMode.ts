export enum ThemeMode {
  Auto = "auto",
  Dark = "dark",
  Light = "light",
}

export type ResolvedThemeMode = Exclude<ThemeMode, ThemeMode.Auto>;

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === ThemeMode.Auto ||
    value === ThemeMode.Dark ||
    value === ThemeMode.Light;
}

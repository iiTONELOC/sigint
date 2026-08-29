import { RuntimeStylesheet } from "@/styles";
import type { Theme } from "../model/colors";

enum ThemeStylesheetOwner {
  Root = "theme-root",
}

export enum ThemeStylesheetEvent {
  Applied = "sigint:theme-stylesheet-applied",
}

enum ThemeCssSyntax {
  RootSelector = ":root",
  TokenPrefix = "--sigint-",
}

const themeStylesheet = new RuntimeStylesheet();

export function applyThemeToRoot(theme: Theme): void {
  const declarations = Object.entries(theme.colors).map(
    ([key, value]) => `${ThemeCssSyntax.TokenPrefix}${key}:${value}`,
  );
  themeStylesheet.update(ThemeStylesheetOwner.Root, [
    `${ThemeCssSyntax.RootSelector}{${declarations.join(";")}}`,
  ]);
  if (typeof document !== "undefined") {
    document.documentElement.dispatchEvent(
      new Event(ThemeStylesheetEvent.Applied),
    );
  }
}

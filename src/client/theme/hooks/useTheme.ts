import { useContext } from "react";
import { ThemeContext, type ThemeContextValue } from "../model/context";

enum ThemeHookError {
  ProviderRequired = "useTheme must be used within ThemeProvider",
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error(ThemeHookError.ProviderRequired);
  return context;
}

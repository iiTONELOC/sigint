import { useContext } from "react";
import {
  LayoutModeContext,
  type LayoutModeContextValue,
} from "../components/context";

enum LayoutModeErrorMessage {
  ProviderRequired = "useLayoutMode must be used within LayoutModeProvider",
}

export function useLayoutMode(): LayoutModeContextValue {
  const context = useContext(LayoutModeContext);
  if (context === undefined) {
    throw new Error(LayoutModeErrorMessage.ProviderRequired);
  }
  return context;
}

export function useIsMobileLayout(): boolean {
  return useLayoutMode().isMobile;
}

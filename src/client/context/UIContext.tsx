import type { SelectedIsolateMode } from "@/workers/render/protocol";
import {
  createContext,
  useContext,
  useState,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { useFreshEntity } from "@/features/base/useFreshEntity";
import { zoomToThenClear } from "@/lib/runtime/revealSignals";
import { getColorMap } from "@/config/theme";
import { useTheme } from "@/context/ThemeContext";
import {
  readRenderGlobeState,
  setRenderIsolation,
  setRenderProjection,
  setRenderRotationEnabled,
  setRenderRotationSpeed,
  toggleRenderRotation,
} from "@/render-surface/globeStateStore";
import { useRenderGlobeState } from "@/render-surface/useRenderGlobeState";
import { RenderProjectionMode } from "@/workers/render/protocol";

// ── Context value type ──────────────────────────────────────────────

type UIContextValue = {
  // Selection
  selected: DataPoint | null;
  selectedCurrent: DataPoint | null;
  setSelected: React.Dispatch<React.SetStateAction<DataPoint | null>>;

  // Isolation
  isolateMode: SelectedIsolateMode;
  setIsolateMode: React.Dispatch<React.SetStateAction<SelectedIsolateMode>>;

  // Chrome visibility
  chromeHidden: boolean;
  setChromeHidden: React.Dispatch<React.SetStateAction<boolean>>;

  // Globe view controls
  flat: boolean;
  setFlat: (flat: boolean) => void;
  autoRotate: boolean;
  setAutoRotate: (enabled: boolean) => void;
  toggleAutoRotate: () => void;
  rotationSpeed: number;
  setRotationSpeed: (speed: number) => void;

  // Search
  searchText: string | null;
  handleSearchCommit: (text: string | null) => void;
  handleSearchSelect: (item: DataPoint) => void;
  handleSearchZoomTo: (item: DataPoint) => void;

  // Globe zoom
  zoomToId: string | null;
  setZoomToId: React.Dispatch<React.SetStateAction<string | null>>;

  /** Gently reveal a point on globe (ISS-level zoom, no lock-on) */
  revealId: string | null;
  setRevealId: React.Dispatch<React.SetStateAction<string | null>>;

  /** Select an item and zoom the globe to it */
  selectAndZoom: (item: DataPoint) => void;

  /** Color map keyed by feature id, derived from theme. */
  colorMap: Record<string, string>;
};

export enum UIContextError {
  MissingProvider = "useUI must be used within UIProvider",
}

const UIContext = createContext<UIContextValue | undefined>(undefined);

// ── Provider ────────────────────────────────────────────────────────

export function UIProvider({ children }: { readonly children: ReactNode }) {
  const { theme } = useTheme();

  // ── View controls ───────────────────────────────────────────────
  const globeState = useRenderGlobeState();
  const flat = globeState.projection === RenderProjectionMode.Flat;
  const autoRotate = globeState.rotationEnabled;
  const rotationSpeed = globeState.rotationSpeed;
  const isolateMode = globeState.isolateMode;
  const setFlat = useCallback((enabled: boolean) => {
    setRenderProjection(
      enabled
        ? RenderProjectionMode.Flat
        : RenderProjectionMode.Globe,
    );
  }, []);
  const setAutoRotate = useCallback((enabled: boolean) => {
    setRenderRotationEnabled(enabled);
  }, []);
  const toggleAutoRotate = useCallback(() => {
    toggleRenderRotation();
  }, []);
  const setRotationSpeed = useCallback((speed: number) => {
    setRenderRotationSpeed(speed);
  }, []);
  const setIsolateMode = useCallback<
    React.Dispatch<React.SetStateAction<SelectedIsolateMode>>
  >((update) => {
    const current = readRenderGlobeState().isolateMode;
    const next =
      typeof update === "function" ? update(current) : update;
    setRenderIsolation(next);
  }, []);
  const [chromeHidden, setChromeHidden] = useState(false);

  // ── Selection & isolation ───────────────────────────────────────
  const [selected, setSelected] = useState<DataPoint | null>(null);

  // ── Search & zoom ──────────────────────────────────────────────
  const [zoomToId, setZoomToId] = useState<string | null>(null);
  const [revealId, setRevealId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState<string | null>(null);

  // ── Derived: selectedCurrent (refreshed from the DataWorker) ───
  const selectedCurrent = useFreshEntity(selected);

  // ── Handlers ───────────────────────────────────────────────────

  const handleSearchSelect = useCallback((item: DataPoint) => {
    setSelected(item);
  }, []);

  const handleSearchZoomTo = useCallback((item: DataPoint) => {
    zoomToThenClear(setZoomToId, item.id);
  }, []);

  const selectAndZoom = useCallback((item: DataPoint) => {
    setSelected(item);
    zoomToThenClear(setZoomToId, item.id);
  }, []);

  const handleSearchCommit = useCallback((text: string | null) => {
    setSearchText(text?.trim() || null);
  }, []);

  const colorMap = useMemo(() => getColorMap(theme), [theme]);

  // ── Context value ──────────────────────────────────────────────
  const value = useMemo<UIContextValue>(
    () => ({
      selected,
      selectedCurrent,
      setSelected,
      isolateMode,
      setIsolateMode,
      chromeHidden,
      setChromeHidden,
      flat,
      setFlat,
      autoRotate,
      setAutoRotate,
      toggleAutoRotate,
      rotationSpeed,
      setRotationSpeed,
      searchText,
      handleSearchCommit,
      handleSearchSelect,
      handleSearchZoomTo,
      zoomToId,
      setZoomToId,
      revealId,
      setRevealId,
      selectAndZoom,
      colorMap,
    }),
    [
      selected,
      selectedCurrent,
      isolateMode,
      chromeHidden,
      flat,
      autoRotate,
      toggleAutoRotate,
      rotationSpeed,
      searchText,
      handleSearchCommit,
      handleSearchSelect,
      handleSearchZoomTo,
      zoomToId,
      revealId,
      selectAndZoom,
      colorMap,
    ],
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

// ── Hook ─────────────────────────────────────────────────────────────

export function useUI(): UIContextValue {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error(UIContextError.MissingProvider);
  }
  return context;
}

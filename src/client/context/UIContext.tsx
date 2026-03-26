import {
  createContext,
  useContext,
  useState,
  useMemo,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { getColorMap } from "@/config/theme";
import { useTheme } from "@/context/ThemeContext";

// ── Context value type ──────────────────────────────────────────────

type UIContextValue = {
  // Selection
  selected: DataPoint | null;
  selectedCurrent: DataPoint | null;
  setSelected: React.Dispatch<React.SetStateAction<DataPoint | null>>;

  // Isolation
  isolateMode: null | "solo" | "focus";
  setIsolateMode: React.Dispatch<React.SetStateAction<null | "solo" | "focus">>;

  // Chrome visibility
  chromeHidden: boolean;
  setChromeHidden: React.Dispatch<React.SetStateAction<boolean>>;

  // Globe view controls
  flat: boolean;
  setFlat: React.Dispatch<React.SetStateAction<boolean>>;
  autoRotate: boolean;
  setAutoRotate: React.Dispatch<React.SetStateAction<boolean>>;
  rotationSpeed: number;
  setRotationSpeed: React.Dispatch<React.SetStateAction<number>>;

  // Search
  searchMatchIds: Set<string> | null;
  handleSearchMatchIds: (ids: Set<string> | null) => void;
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

  /** Color map keyed by feature id — derived from theme */
  colorMap: Record<string, string>;
};

const UIContext = createContext<UIContextValue | undefined>(undefined);

// ── Provider ────────────────────────────────────────────────────────

export function UIProvider({
  children,
  idMap,
}: {
  children: ReactNode;
  /** ID map from DataContext — used to resolve selectedCurrent */
  idMap: Map<string, DataPoint>;
}) {
  const { theme } = useTheme();
  const stashedSelectionRef = useRef<DataPoint | null>(null);
  const stashedIsolateModeRef = useRef<null | "solo" | "focus">(null);

  // ── View controls ───────────────────────────────────────────────
  const [flat, setFlat] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [rotationSpeed, setRotationSpeed] = useState(0.35);
  const [chromeHidden, setChromeHidden] = useState(false);

  // ── Selection & isolation ───────────────────────────────────────
  const [selected, setSelected] = useState<DataPoint | null>(null);
  const [isolateMode, setIsolateMode] = useState<null | "solo" | "focus">(null);

  // ── Search & zoom ──────────────────────────────────────────────
  const [zoomToId, setZoomToId] = useState<string | null>(null);
  const [revealId, setRevealId] = useState<string | null>(null);
  const [searchMatchIds, setSearchMatchIds] = useState<Set<string> | null>(
    null,
  );

  // ── Derived: selectedCurrent (refreshed from latest data) ──────
  const selectedCurrent = useMemo(() => {
    if (!selected) return null;
    return idMap.get(selected.id) ?? selected;
  }, [idMap, selected]);

  // ── Handlers ───────────────────────────────────────────────────

  const handleSearchSelect = useCallback((item: DataPoint) => {
    setSelected(item);
  }, []);

  const handleSearchZoomTo = useCallback((item: DataPoint) => {
    setZoomToId(item.id);
    setTimeout(() => setZoomToId(null), 100);
  }, []);

  const selectAndZoom = useCallback((item: DataPoint) => {
    setSelected(item);
    setZoomToId(item.id);
    setTimeout(() => setZoomToId(null), 100);
  }, []);

  const handleSearchMatchIds = useCallback(
    (ids: Set<string> | null) => {
      setSearchMatchIds(ids);
      if (ids) {
        setSelected((prev) => {
          if (prev && !ids.has(prev.id)) {
            stashedSelectionRef.current = prev;
            stashedIsolateModeRef.current = isolateMode;
            setIsolateMode(null);
            return null;
          }
          return prev;
        });
      } else {
        if (stashedSelectionRef.current) {
          setSelected(stashedSelectionRef.current);
          setIsolateMode(stashedIsolateModeRef.current);
          stashedSelectionRef.current = null;
          stashedIsolateModeRef.current = null;
        }
      }
    },
    [isolateMode],
  );

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
      rotationSpeed,
      setRotationSpeed,
      searchMatchIds,
      handleSearchMatchIds,
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
      rotationSpeed,
      searchMatchIds,
      handleSearchMatchIds,
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
    throw new Error("useUI must be used within UIProvider");
  }
  return context;
}

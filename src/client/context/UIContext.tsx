import {
  isSelectedIsolateMode,
  type SelectedIsolateMode,
} from "@/workers/render/protocol";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { useFreshEntity, useSourceEntity } from "@/features/base/useFreshEntity";
import { zoomToThenClear } from "@/lib/runtime/revealSignals";
import {
  carryAcrossUpdate,
  takeCarriedState,
} from "@/lib/runtime/swRegistration";
import { ServiceWorkerCarryKey } from "@/runtime";
import { sourceForPointType } from "@shared/domain/pointSource";
import { isRecord } from "@shared/geo";
import { getColorMap, useTheme } from "@/theme";
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


type UIContextValue = {
  selected: DataPoint | null;
  selectedCurrent: DataPoint | null;
  setSelected: React.Dispatch<React.SetStateAction<DataPoint | null>>;

  isolateMode: SelectedIsolateMode;
  setIsolateMode: React.Dispatch<React.SetStateAction<SelectedIsolateMode>>;

  chromeHidden: boolean;
  setChromeHidden: React.Dispatch<React.SetStateAction<boolean>>;

  flat: boolean;
  setFlat: (flat: boolean) => void;
  autoRotate: boolean;
  setAutoRotate: (enabled: boolean) => void;
  toggleAutoRotate: () => void;
  rotationSpeed: number;
  setRotationSpeed: (speed: number) => void;

  searchText: string | null;
  handleSearchCommit: (text: string | null) => void;
  handleSearchSelect: (item: DataPoint) => void;
  handleSearchZoomTo: (item: DataPoint) => void;

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

type CarriedSelection = Readonly<{
  type: string;
  id: string;
  isolateMode: SelectedIsolateMode;
}>;

function parseCarriedSelection(value: unknown): CarriedSelection | null {
  if (!isRecord(value)) return null;
  const { type, id, isolateMode } = value;
  if (typeof type !== "string" || typeof id !== "string") return null;
  if (!isSelectedIsolateMode(isolateMode)) return null;
  return { type, id, isolateMode };
}

function takeCarriedSelection(): CarriedSelection | null {
  return parseCarriedSelection(takeCarriedState(ServiceWorkerCarryKey.Selection));
}

function useSelectionCarriedAcrossUpdate(
  selected: DataPoint | null,
  isolateMode: SelectedIsolateMode,
  restore: (item: DataPoint, isolateMode: SelectedIsolateMode) => void,
): void {
  const [pending, setPending] = useState(takeCarriedSelection);
  const restored = useSourceEntity(
    pending ? sourceForPointType(pending.type) : null,
    pending?.id ?? null,
  );

  useEffect(() => {
    if (!pending || !restored) return;
    setPending(null);
    restore(restored, pending.isolateMode);
  }, [pending, restored, restore]);

  useEffect(() => {
    if (selected) setPending(null);
  }, [selected]);

  useEffect(
    () =>
      carryAcrossUpdate(ServiceWorkerCarryKey.Selection, () =>
        selected ? { type: selected.type, id: selected.id, isolateMode } : null,
      ),
    [selected, isolateMode],
  );
}


export function UIProvider({ children }: { readonly children: ReactNode }) {
  const { theme } = useTheme();

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

  const [selected, setSelected] = useState<DataPoint | null>(null);

  const [zoomToId, setZoomToId] = useState<string | null>(null);
  const [revealId, setRevealId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState<string | null>(null);

  const selectedCurrent = useFreshEntity(selected);


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

  const restoreSelection = useCallback(
    (item: DataPoint, mode: SelectedIsolateMode) => {
      selectAndZoom(item);
      setIsolateMode(mode);
    },
    [selectAndZoom, setIsolateMode],
  );
  useSelectionCarriedAcrossUpdate(selected, isolateMode, restoreSelection);

  const handleSearchCommit = useCallback((text: string | null) => {
    setSearchText(text?.trim() || null);
  }, []);

  const colorMap = useMemo(() => getColorMap(theme), [theme]);

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


export function useUI(): UIContextValue {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error(UIContextError.MissingProvider);
  }
  return context;
}

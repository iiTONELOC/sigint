import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useDataContext } from "@/context/DataContext";
import { useIsMobileLayout } from "@/layout-mode";
import {
  setDossierOpen,
  onDossierOpenRequest,
  onWatchLayoutRequest,
} from "@/lib/runtime/layoutSignals";
import {
  onWalkthroughReset,
  onWalkthroughUndo,
  setWalkthroughLayoutSnapshot,
} from "@/walkthrough";
import { Bookmark } from "lucide-react";
import { ButtonType } from "@/lib/ui/button";

import type {
  LayoutNode,
  PaneType,
  LayoutState,
  LayoutPreset,
  LayoutPresetCatalog,
} from "./paneTree";
import {
  leaf,
  collectLeafTypes,
  leafCount,
  hasDossierInTree,
  collectLeaves,
  defaultLayout,
  loadLayout,
  normalizeMobileLayout,
  persistLayout,
  loadPresets,
  savePresets,
} from "./paneTree";
import {
  PaneType as PaneTypeId,
  PaneWorkspaceIconMetric,
  type PaneEdgeDropZoneValue,
  type SplitDirectionValue,
} from "@/panes/workspace/model/pane";
import {
  changePaneTypeInLayout,
  closePaneTypeInLayout,
  closePaneLayout,
  createWatchLayout,
  insertPaneBesideInLayout,
  minimizePaneLayout,
  openDossierInLayout,
  resizePaneLayout,
  restorePaneLayout,
  splitPaneLayout,
  swapPanesInLayout,
  type PanePlacementContext,
} from "@/panes/workspace/utils/operations";
import { LayoutPresetMenu } from "./LayoutPresetMenu";
import { PaneMobile } from "./PaneMobile";
import { DesktopPaneTree } from "@/panes/workspace/components/DesktopPaneTree";
import { PaneBodyLayer } from "@/panes/workspace/components/paneBody";
import { PANE_CATALOG } from "@/panes/workspace/paneCatalog";

enum PaneManagerCopy {
  PreTourLayout = "Pre-Tour Layout",
  Restore = "RESTORE",
}

enum PaneManagerToken {
  PaneTypeSeparator = ",",
  WalkthroughLayout = "alert-log,globe,video-feed",
}

function comparePaneTypes(left: PaneType, right: PaneType): number {
  return left.localeCompare(right);
}

function panePlacementContext(
  layout: LayoutState,
  isMobile: boolean,
): PanePlacementContext {
  const globe = collectLeaves(layout.root).find(
    (entry) => entry.paneType === PaneTypeId.Globe,
  );
  const element = globe
    ? document.querySelector(`[data-pane-leaf-id="${globe.id}"]`)
    : null;
  const width = element?.getBoundingClientRect().width;
  return {
    availableWidth: width || window.innerWidth,
    isMobile,
  };
}

function paneTypeSignature(root: LayoutNode): string {
  return collectLeaves(root)
    .map((entry) => entry.paneType)
    .sort(comparePaneTypes)
    .join(PaneManagerToken.PaneTypeSeparator);
}

function hasPresetWithSignature(
  presets: LayoutPresetCatalog,
  signature: string,
): boolean {
  return Object.values(presets).some(
    (preset) => paneTypeSignature(preset.state.root) === signature,
  );
}

function savePreTourLayout(
  presets: LayoutPresetCatalog,
  state: LayoutState,
): LayoutPresetCatalog {
  return {
    ...presets,
    [PaneManagerCopy.PreTourLayout]: {
      name: PaneManagerCopy.PreTourLayout,
      state,
    },
  };
}

function usePaneLayoutActions(
  setLayout: Dispatch<SetStateAction<LayoutState>>,
) {
  const splitPane = useCallback(
    (
      leafId: string,
      direction: SplitDirectionValue,
      newType: PaneType,
    ) => {
      setLayout((current) =>
        splitPaneLayout(current, leafId, direction, newType),
      );
    },
    [setLayout],
  );
  const closePane = useCallback((leafId: string) => {
    setLayout((current) => closePaneLayout(current, leafId));
  }, [setLayout]);
  const minimizePane = useCallback(
    (leafId: string, paneType: PaneType) => {
      setLayout((current) =>
        minimizePaneLayout(current, leafId, paneType),
      );
    },
    [setLayout],
  );
  const restorePane = useCallback((index: number) => {
    setLayout((current) => restorePaneLayout(current, index));
  }, [setLayout]);
  const resizeSplit = useCallback((splitId: string, ratio: number) => {
    setLayout((current) => resizePaneLayout(current, splitId, ratio));
  }, [setLayout]);
  const changePaneType = useCallback(
    (leafId: string, newType: PaneType) => {
      setLayout((current) =>
        changePaneTypeInLayout(current, leafId, newType),
      );
    },
    [setLayout],
  );
  const swapPanes = useCallback(
    (sourceLeafId: string, targetLeafId: string) => {
      setLayout((current) =>
        swapPanesInLayout(current, sourceLeafId, targetLeafId),
      );
    },
    [setLayout],
  );
  const insertPaneBeside = useCallback(
    (
      sourceLeafId: string,
      targetLeafId: string,
      zone: PaneEdgeDropZoneValue,
    ) => {
      setLayout((current) =>
        insertPaneBesideInLayout(
          current,
          sourceLeafId,
          targetLeafId,
          zone,
        ),
      );
    },
    [setLayout],
  );
  return {
    changePaneType,
    closePane,
    insertPaneBeside,
    minimizePane,
    resizeSplit,
    restorePane,
    splitPane,
    swapPanes,
  };
}

// ── Component ────────────────────────────────────────────────────────

export function PaneManager() {
  const { activeCount, dataSources, counts } = useDataContext();

  // Mobile detection follows the LayoutModeContext override.
  const isMobile = useIsMobileLayout();

  const [layout, setLayout] = useState<LayoutState>(defaultLayout);
  const layoutLoaded = useRef(false);
  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const {
    changePaneType,
    closePane,
    insertPaneBeside,
    minimizePane,
    resizeSplit,
    restorePane,
    splitPane,
    swapPanes,
  } = usePaneLayoutActions(setLayout);

  useEffect(() => {
    let mounted = true;
    loadLayout(isMobile).then((loaded) => {
      if (mounted) {
        setLayout(isMobile ? normalizeMobileLayout(loaded) : loaded);
        layoutLoaded.current = true;
      }
    });
    return () => {
      mounted = false;
    };
  }, [isMobile]);

  useEffect(() => {
    if (!layoutLoaded.current) return;
    persistLayout(layout, isMobileRef.current);
  }, [layout]);

  // ── Dossier signal ──────────────────────────────────────────────
  useEffect(() => {
    const open = hasDossierInTree(layout.root);
    setDossierOpen(open);
    return () => setDossierOpen(false);
  }, [layout.root]);

  // ── Listen for dossier open requests from DetailPanel ──────────
  useEffect(() => {
    return onDossierOpenRequest(() => {
      setLayout(
        openDossierInLayout(
          layoutRef.current,
          panePlacementContext(layoutRef.current, isMobileRef.current),
        ),
      );
    });
  }, []);

  // ── Listen for watch layout requests ────────────────────────────
  useEffect(() => {
    return onWatchLayoutRequest(() => {
      setLayout(
        createWatchLayout(
          layoutRef.current,
          panePlacementContext(layoutRef.current, isMobileRef.current),
        ),
      );
    });
  }, []);

  // ── Walkthrough: reset to globe-only on tour start ──────────────
  // If user has a non-default layout, save it as a preset first so it's not lost.
  useEffect(() => {
    return onWalkthroughReset(() => {
      const cur = layoutRef.current;
      const count = leafCount(cur.root);
      const hasMinimized = cur.minimized.length > 0;
      const leaves = collectLeaves(cur.root);
      const isDefaultGlobe =
        count === 1 &&
        !hasMinimized &&
        leaves[0]?.paneType === PaneTypeId.Globe;

      const currentSignature = paneTypeSignature(cur.root);
      const isWalkthroughLayout =
        currentSignature === PaneManagerToken.WalkthroughLayout;
      const existing = presetsRef.current;
      const matchesPreset = hasPresetWithSignature(
        existing,
        currentSignature,
      );

      if (!isDefaultGlobe && !isWalkthroughLayout && !matchesPreset) {
        const next = savePreTourLayout(existing, cur);
        setPresets(next);
        savePresets(next);
      }

      setLayout({ root: leaf(PaneTypeId.Globe), minimized: [] });
    });
  }, []);

  // ── Walkthrough: undo wrong pane pick ─────────────────────────
  useEffect(() => {
    return onWalkthroughUndo((paneType) => {
      setLayout(closePaneTypeInLayout(layoutRef.current, paneType));
    });
  }, []);

  const openTypes = useMemo(() => {
    const s = collectLeafTypes(layout.root);
    for (const m of layout.minimized) s.add(m.paneType);
    return s;
  }, [layout.root, layout.minimized]);

  const availableTypes = useMemo<PaneType[]>(
    () =>
      Object.values(PaneTypeId).filter((paneType) => !openTypes.has(paneType)),
    [openTypes],
  );

  // ── Layout presets ─────────────────────────────────────────────

  const [showPresets, setShowPresets] = useState(false);
  const [presets, setPresets] = useState<LayoutPresetCatalog>({});
  const [presetsLoaded, setPresetsLoaded] = useState(false);
  const presetsRef = useRef(presets);
  presetsRef.current = presets;
  const presetList = useMemo(() => Object.values(presets), [presets]);

  // ── Walkthrough: push layout snapshot for action step detection ──
  useEffect(() => {
    const types = collectLeafTypes(layout.root);
    const count = leafCount(layout.root);
    setWalkthroughLayoutSnapshot(types, count, presetList.length);
  }, [layout.root, presetList.length]);

  useEffect(() => {
    loadPresets().then((loaded) => {
      setPresets(loaded);
      setPresetsLoaded(true);
    });
  }, []);

  const handleSavePreset = useCallback(
    (name: string) => {
      const next = { ...presets, [name]: { name, state: layout } };
      setPresets(next);
      savePresets(next);
    },
    [presets, layout],
  );
  const handleLoadPreset = useCallback(
    (p: LayoutPreset) =>
      setLayout(
        isMobileRef.current ? normalizeMobileLayout(p.state) : p.state,
      ),
    [],
  );
  const handleUpdatePreset = useCallback(
    (idx: number) => {
      const preset = presetList[idx];
      if (!preset) return;
      const next = {
        ...presets,
        [preset.name]: { ...preset, state: layout },
      };
      setPresets(next);
      savePresets(next);
    },
    [layout, presetList, presets],
  );
  const handleDeletePreset = useCallback(
    (idx: number) => {
      const preset = presetList[idx];
      if (!preset) return;
      const next = { ...presets };
      delete next[preset.name];
      setPresets(next);
      savePresets(next);
    },
    [presetList, presets],
  );

  const allLeaves = useMemo(() => collectLeaves(layout.root), [layout.root]);

  if (isMobile) {
    return (
      <PaneBodyLayer root={layout.root}>
      <PaneMobile
        allLeaves={allLeaves}
        layout={layout}
        activeCount={activeCount}
        dataSources={dataSources}
        counts={counts}
        paneCatalog={PANE_CATALOG}
        closePane={closePane}
        changePaneType={changePaneType}
        restorePane={restorePane}
        splitPane={splitPane}
        resizeSplit={resizeSplit}
        availableTypes={availableTypes}
        leafCount={leafCount(layout.root)}
        swapPanes={swapPanes}
        insertPaneBeside={insertPaneBeside}
        presets={presetList}
        presetsLoaded={presetsLoaded}
        onLoadPreset={handleLoadPreset}
        onSavePreset={handleSavePreset}
        onUpdatePreset={handleUpdatePreset}
        onDeletePreset={handleDeletePreset}
      />
      </PaneBodyLayer>
    );
  }

  // ── DESKTOP ────────────────────────────────────────────────────

  return (
    <PaneBodyLayer root={layout.root}>
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* Minimized panes and layout presets */}
      <div
        data-tour="pane-toolbar"
        className="shrink-0 flex items-center gap-1 px-2 py-0.5 border-b border-sig-border/50 bg-sig-panel/60"
      >
        {layout.minimized.map((m, i) => {
          const definition = PANE_CATALOG[m.paneType];
          const Icon = definition.icon;
          return (
            <button
              type={ButtonType.Button}
              key={m.id}
              onClick={() => restorePane(i)}
              aria-label={`Restore ${definition.label} pane`}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-sig-accent text-(length:--sig-text-sm) bg-sig-accent/10 border border-sig-accent/40 hover:text-sig-bright hover:bg-sig-accent/15 transition-colors shrink-0"
              title={`Restore ${definition.label}`}
            >
              <Icon
                size={PaneWorkspaceIconMetric.ToolbarSize}
                strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
              />
              {PaneManagerCopy.Restore} {definition.label}
            </button>
          );
        })}
        <div className="flex-1" />
        <div className="relative">
          <button
            type={ButtonType.Button}
            data-tour="views-btn"
            onClick={() => setShowPresets((v) => !v)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-sig-dim text-(length:--sig-text-sm) border border-sig-border/50 hover:text-sig-accent transition-colors"
            title="Layout presets"
          >
            <Bookmark
              size={PaneWorkspaceIconMetric.ToolbarSize}
              strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
            />
            <span className="hidden sm:inline tracking-wider">VIEWS</span>
          </button>
          {showPresets && (
            <LayoutPresetMenu
              presets={presetList}
              presetsLoaded={presetsLoaded}
              onLoad={handleLoadPreset}
              onSave={handleSavePreset}
              onUpdate={handleUpdatePreset}
              onDelete={handleDeletePreset}
              onClose={() => setShowPresets(false)}
            />
          )}
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <DesktopPaneTree
          activeCount={activeCount}
          availableTypes={availableTypes}
          changePaneType={changePaneType}
          closePane={closePane}
          dataSources={dataSources}
          insertPaneBeside={insertPaneBeside}
          minimizePane={minimizePane}
          resizeSplit={resizeSplit}
          root={layout.root}
          splitPane={splitPane}
          swapPanes={swapPanes}
        />
      </div>
    </div>
    </PaneBodyLayer>
  );
}

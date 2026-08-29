import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { setVideoPresetCount, useWalkthroughActive } from "@/walkthrough";
import { ButtonType } from "@/lib/ui/button";
import {
  Square,
  Columns2,
  LayoutGrid,
  Grid3X3,
  Loader2,
  Bookmark,
  Minimize,
  Fullscreen,
  type LucideIcon,
} from "lucide-react";
import type {
  Channel,
  ChannelCatalog,
  GridLayout,
  Preset,
  PresetCatalog,
  SlotState,
  SavedState,
} from "./videoFeedTypes";
import { EMPTY_VIDEO_SLOT_STATE } from "./videoFeedTypes";
import { fetchNewsChannels } from "./channelService";
import {
  saveState,
  loadState,
  loadPresets,
  savePresets,
  restoreChannels,
  buildSavedState,
  addPreset,
} from "./videoFeedPersistence";
import { VideoSlot } from "./VideoSlot";
import { PresetMenu } from "./PresetMenu";
import { videoGridLabel } from "./videoGrid";

enum VideoFeedIconMetric {
  CompactSize = 10,
  StrokeWidth = 2.5,
  ToolbarSize = 12,
}

enum VideoFeedControlClassName {
  Active = "text-sig-accent bg-sig-accent/15",
  Divider = "w-px h-4 bg-sig-border/50",
  Inactive = "text-sig-dim bg-transparent hover:text-sig-bright",
}

type VideoGridView = Readonly<{
  className: string;
  icon: LucideIcon;
}>;

const GRID_VIEW_BY_LAYOUT: Readonly<Record<GridLayout, VideoGridView>> = {
  1: { className: "grid-cols-1 grid-rows-1", icon: Square },
  2: { className: "grid-cols-1 grid-rows-2", icon: Columns2 },
  4: { className: "grid-cols-2 grid-rows-2", icon: LayoutGrid },
  9: { className: "grid-cols-3 grid-rows-3", icon: Grid3X3 },
};

const GRID_LAYOUT_ORDER: readonly GridLayout[] = [1, 2, 4, 9];

export function VideoFeedPane() {
  const [channels, setChannels] = useState<ChannelCatalog>({});
  const [loading, setLoading] = useState(true);
  const [showPresets, setShowPresets] = useState(false);
  const [presets, setPresets] = useState<PresetCatalog>({});

  useEffect(() => {
    loadPresets().then(setPresets);
  }, []);

  useEffect(() => {
    setVideoPresetCount(Object.keys(presets).length);
  }, [presets]);

  const paneRef = useRef<HTMLDivElement>(null);

  const [savedState, setSavedState] = useState<SavedState | null>(null);
  useEffect(() => {
    loadState().then(setSavedState);
  }, []);

  const [gridLayout, setGridLayout] = useState<GridLayout>(1);
  const [slots, setSlots] = useState<SlotState[]>([
    EMPTY_VIDEO_SLOT_STATE,
  ]);
  const [unmutedSlot, setUnmutedSlot] = useState<number | null>(null);
  const restoredRef = useRef(false);

  const [promotedSlotIndex, setPromotedSlotIndex] = useState<number | null>(
    null,
  );

  const handlePromote = useCallback(
    (slotIndex: number) => setPromotedSlotIndex(slotIndex),
    [],
  );

  const handleRestoreGrid = useCallback(() => {
    setPromotedSlotIndex(null);
  }, []);

  const handlePaneFullscreen = useCallback(() => {
    const paneElement = paneRef.current;
    if (!paneElement) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      paneElement.requestFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    fetchNewsChannels().then((loadedChannels) => {
      setChannels(loadedChannels);
      setLoading(false);
    });
  }, []);

  const channelList = useMemo(() => Object.values(channels), [channels]);

  useEffect(() => {
    if (!savedState || channelList.length === 0 || restoredRef.current) return;
    restoredRef.current = true;
    if (savedState.grid) setGridLayout(savedState.grid);
    if (savedState.unmutedSlot != null) {
      setUnmutedSlot(savedState.unmutedSlot);
    }
    if (savedState.slots) {
      const restored = restoreChannels(savedState.slots, channels);
      setSlots(restored);
    }
  }, [channelList.length, channels, savedState]);

  const walkthroughActive = useWalkthroughActive();
  const walkthroughSetRef = useRef(false);
  useEffect(() => {
    if (
      !walkthroughActive ||
      channelList.length === 0 ||
      walkthroughSetRef.current
    ) {
      return;
    }
    walkthroughSetRef.current = true;
    const nbc = channelList.find((channel) =>
      channel.name.toLowerCase().includes("nbc news now"),
    );
    const oan = channelList.find((channel) =>
      channel.name.toLowerCase().includes("oan"),
    );
    if (nbc || oan) {
      setGridLayout(2);
      setSlots([
        { channel: nbc ?? null, error: false, loading: false },
        { channel: oan ?? null, error: false, loading: false },
      ]);
    }
  }, [channelList, walkthroughActive]);

  useEffect(() => {
    setSlots((currentSlots) => {
      const needed = gridLayout;
      if (currentSlots.length === needed) return currentSlots;
      if (currentSlots.length < needed) {
        return [
          ...currentSlots,
          ...Array.from(
            { length: needed - currentSlots.length },
            () => EMPTY_VIDEO_SLOT_STATE,
          ),
        ];
      }
      return currentSlots.slice(0, needed);
    });
  }, [gridLayout]);

  useEffect(() => {
    const hasContent = slots.some((slot) => slot.channel !== null);
    if (!restoredRef.current && !hasContent) return;
    saveState(gridLayout, slots, unmutedSlot);
  }, [gridLayout, slots, unmutedSlot]);

  const updateSlot = useCallback(
    (slotIndex: number, updates: Partial<SlotState>) => {
      setSlots((currentSlots) => {
        const currentSlot = currentSlots[slotIndex];
        if (!currentSlot) return currentSlots;
        const updatedSlots = [...currentSlots];
        updatedSlots[slotIndex] = { ...currentSlot, ...updates };
        return updatedSlots;
      });
    },
    [],
  );

  const assignChannel = useCallback(
    (slotIndex: number, channel: Channel) => {
      updateSlot(slotIndex, {
        channel,
        error: false,
        loading: true,
      });
      if (gridLayout === 1) setUnmutedSlot(0);
    },
    [gridLayout, updateSlot],
  );

  const clearSlot = useCallback(
    (slotIndex: number) => updateSlot(slotIndex, EMPTY_VIDEO_SLOT_STATE),
    [updateSlot],
  );

  const slotError = useCallback(
    (slotIndex: number) =>
      updateSlot(slotIndex, { error: true, loading: false }),
    [updateSlot],
  );

  const slotLoaded = useCallback(
    (slotIndex: number) =>
      updateSlot(slotIndex, { error: false, loading: false }),
    [updateSlot],
  );

  const toggleMute = useCallback((slotIndex: number) => {
    setUnmutedSlot((currentIndex) =>
      currentIndex === slotIndex ? null : slotIndex,
    );
  }, []);

  const persistPresets = useCallback((updated: PresetCatalog) => {
    setPresets(updated);
    savePresets(updated);
  }, []);

  const handleSavePreset = useCallback(
    (name: string) => {
      const state = buildSavedState(gridLayout, slots);
      persistPresets(addPreset(presets, { name, state }));
    },
    [gridLayout, persistPresets, presets, slots],
  );

  const handleLoadPreset = useCallback(
    (preset: Preset) => {
      setGridLayout(preset.state.grid);
      const restored = restoreChannels(preset.state.slots, channels);
      const needed = preset.state.grid;
      if (restored.length < needed) {
        while (restored.length < needed) {
          restored.push(EMPTY_VIDEO_SLOT_STATE);
        }
      }
      setSlots(restored.slice(0, needed));
    },
    [channels],
  );

  const handleDeletePreset = useCallback(
    (presetKey: string) => {
      if (!Object.hasOwn(presets, presetKey)) return;
      const updated: Record<string, Preset> = { ...presets };
      delete updated[presetKey];
      persistPresets(updated);
    },
    [persistPresets, presets],
  );

  const handleUpdatePreset = useCallback(
    (presetKey: string) => {
      const preset = presets[presetKey];
      if (!preset) return;
      const state = buildSavedState(gridLayout, slots);
      persistPresets(
        { ...presets, [presetKey]: { ...preset, state } },
      );
    },
    [gridLayout, persistPresets, presets, slots],
  );

  const gridClass =
    GRID_VIEW_BY_LAYOUT[promotedSlotIndex === null ? gridLayout : 1]
      .className;
  const visibleSlots =
    promotedSlotIndex === null
      ? slots
      : slots.slice(promotedSlotIndex, promotedSlotIndex + 1);

  return (
    <div
      ref={paneRef}
      className="w-full h-full flex flex-col bg-black overflow-hidden"
    >
      <div className="shrink-0 flex items-center justify-end gap-1.5 px-2 py-1 border-b border-sig-border/40 bg-sig-panel/80 relative">
        {promotedSlotIndex !== null && (
          <button
            type={ButtonType.Button}
            onClick={handleRestoreGrid}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-sig-accent text-(length:--sig-text-sm) font-semibold tracking-wider bg-sig-accent/10 border border-sig-accent/30 hover:bg-sig-accent/20 transition-colors mr-auto"
          >
            <Minimize
              size={VideoFeedIconMetric.CompactSize}
              strokeWidth={VideoFeedIconMetric.StrokeWidth}
            />
            RESTORE{" "}
            {videoGridLabel(gridLayout)}
          </button>
        )}

        <div className="flex items-center gap-0.5">
          {GRID_LAYOUT_ORDER.map((layout) => {
            const GridIcon = GRID_VIEW_BY_LAYOUT[layout].icon;
            return (
              <button
                type={ButtonType.Button}
                key={layout}
                onClick={() => {
                  setGridLayout(layout);
                  setPromotedSlotIndex(null);
                }}
                className={`p-1.5 touch-target flex items-center justify-center rounded transition-colors border-none ${
                  gridLayout === layout
                    ? VideoFeedControlClassName.Active
                    : VideoFeedControlClassName.Inactive
                }`}
                title={videoGridLabel(layout)}
              >
                <GridIcon
                  size={VideoFeedIconMetric.ToolbarSize}
                  strokeWidth={VideoFeedIconMetric.StrokeWidth}
                />
              </button>
            );
          })}
        </div>
        <div className={VideoFeedControlClassName.Divider} />
        <button
          type={ButtonType.Button}
          onClick={() => setShowPresets((visible) => !visible)}
          className={`p-1.5 touch-target flex items-center justify-center rounded transition-colors border-none ${
            showPresets
              ? VideoFeedControlClassName.Active
              : VideoFeedControlClassName.Inactive
          }`}
          title="Presets"
          data-tour="video-preset-btn"
        >
          <Bookmark
            size={VideoFeedIconMetric.ToolbarSize}
            strokeWidth={VideoFeedIconMetric.StrokeWidth}
          />
        </button>
        <span className="text-sig-dim text-(length:--sig-text-sm)">
          {loading ? (
            <Loader2
              size={VideoFeedIconMetric.CompactSize}
              className="animate-spin"
            />
          ) : (
            `${channelList.length} ch`
          )}
        </span>
        <div className={VideoFeedControlClassName.Divider} />
        <button
          type={ButtonType.Button}
          onClick={handlePaneFullscreen}
          className="p-1.5 touch-target flex items-center justify-center rounded text-sig-dim bg-transparent border-none hover:text-sig-bright transition-colors"
          title="Fullscreen pane"
        >
          <Fullscreen
            size={VideoFeedIconMetric.ToolbarSize}
            strokeWidth={VideoFeedIconMetric.StrokeWidth}
          />
        </button>
        {showPresets && (
          <PresetMenu
            presets={presets}
            onLoad={handleLoadPreset}
            onSave={handleSavePreset}
            onUpdate={handleUpdatePreset}
            onDelete={handleDeletePreset}
            onClose={() => setShowPresets(false)}
          />
        )}
      </div>

      <div className={`flex-1 grid ${gridClass} gap-0.5 p-0.5 min-h-0`}>
        {visibleSlots.map((slot, visibleIndex) => {
          const slotIndex = promotedSlotIndex ?? visibleIndex;
          return (
            <VideoSlot
              key={`slot-${slotIndex}`}
              slot={slot}
              slotIndex={slotIndex}
              channels={channels}
              onAssign={assignChannel}
              onClear={clearSlot}
              onSlotError={slotError}
              onSlotLoaded={slotLoaded}
              muted={unmutedSlot !== slotIndex}
              onToggleMute={toggleMute}
              gridSize={promotedSlotIndex !== null ? 1 : gridLayout}
              onPromote={gridLayout > 1 ? handlePromote : undefined}
              onUnfocus={
                promotedSlotIndex === slotIndex
                  ? handleRestoreGrid
                  : undefined
              }
            />
          );
        })}
      </div>
    </div>
  );
}

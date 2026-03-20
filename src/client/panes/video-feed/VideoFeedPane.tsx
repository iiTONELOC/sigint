import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Square,
  Columns2,
  LayoutGrid,
  Loader2,
  Bookmark,
  Minimize,
  Maximize,
} from "lucide-react";
import type {
  Channel,
  GridLayout,
  SlotState,
  SavedState,
} from "./videoFeedTypes";
import { fetchNewsChannels } from "./channelService";
import {
  saveState,
  loadState,
  loadPresets,
  savePresets,
  restoreChannels,
  buildSavedState,
} from "./videoFeedPersistence";
import type { Preset } from "./videoFeedTypes";
import { VideoSlot } from "./VideoSlot";
import { PresetMenu } from "./PresetMenu";

export function VideoFeedPane() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPresets, setShowPresets] = useState(false);
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const paneRef = useRef<HTMLDivElement>(null);

  // Restore saved state or default
  const savedState = useMemo(() => loadState(), []);
  const [gridLayout, setGridLayout] = useState<GridLayout>(
    savedState?.grid ?? 1,
  );
  const [slots, setSlots] = useState<SlotState[]>(() => {
    if (savedState?.slots) {
      return savedState.slots.map(
        () => ({ channel: null, error: false, loading: false }) as SlotState,
      );
    }
    return [{ channel: null, error: false, loading: false }];
  });
  const [mutedSlot, setMutedSlot] = useState<number | null>(null);
  const restoredRef = useRef(false);

  // ── Promote: temporarily show one slot as 1×1 ──────────────────
  const [promotedIdx, setPromotedIdx] = useState<number | null>(null);
  const [prePromoteGrid, setPrePromoteGrid] = useState<GridLayout | null>(null);

  const handlePromote = useCallback(
    (idx: number) => {
      setPrePromoteGrid(gridLayout);
      setPromotedIdx(idx);
    },
    [gridLayout],
  );

  const handleRestoreGrid = useCallback(() => {
    setPromotedIdx(null);
    setPrePromoteGrid(null);
  }, []);

  const handlePaneFullscreen = useCallback(() => {
    const el = paneRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  }, []);

  // Fetch channels, then restore saved slots
  useEffect(() => {
    fetchNewsChannels().then((chs) => {
      setChannels(chs);
      setLoading(false);
      if (savedState?.slots && !restoredRef.current) {
        restoredRef.current = true;
        const restored = restoreChannels(savedState.slots, chs);
        setSlots(restored);
      }
    });
  }, []);

  // Adjust slot count when grid changes
  useEffect(() => {
    setSlots((prev) => {
      const needed = gridLayout;
      if (prev.length === needed) return prev;
      if (prev.length < needed) {
        return [
          ...prev,
          ...Array.from({ length: needed - prev.length }, () => ({
            channel: null as Channel | null,
            error: false,
            loading: false,
          })),
        ];
      }
      return prev.slice(0, needed);
    });
  }, [gridLayout]);

  // Auto-save whenever slots or grid change
  useEffect(() => {
    const hasContent = slots.some((s) => s.channel !== null);
    if (!restoredRef.current && !hasContent) return;
    saveState(gridLayout, slots);
  }, [gridLayout, slots]);

  const assignChannel = useCallback(
    (idx: number, ch: Channel) => {
      setSlots((prev) => {
        const next = [...prev];
        if (next[idx]) next[idx] = { channel: ch, error: false, loading: true };
        return next;
      });
      if (gridLayout === 1) setMutedSlot(0);
    },
    [gridLayout],
  );

  const clearSlot = useCallback((idx: number) => {
    setSlots((prev) => {
      const next = [...prev];
      if (next[idx])
        next[idx] = { channel: null, error: false, loading: false };
      return next;
    });
  }, []);

  const slotError = useCallback((idx: number) => {
    setSlots((prev) => {
      const next = [...prev];
      if (next[idx]) next[idx] = { ...next[idx]!, error: true, loading: false };
      return next;
    });
  }, []);

  const slotLoaded = useCallback((idx: number) => {
    setSlots((prev) => {
      const next = [...prev];
      if (next[idx])
        next[idx] = { ...next[idx]!, loading: false, error: false };
      return next;
    });
  }, []);

  const toggleMute = useCallback((idx: number) => {
    setMutedSlot((prev) => (prev === idx ? null : idx));
  }, []);

  // Preset handlers
  const handleSavePreset = useCallback(
    (name: string) => {
      const state = buildSavedState(gridLayout, slots);
      const updated = [...presets, { name, state }];
      setPresets(updated);
      savePresets(updated);
    },
    [gridLayout, slots, presets],
  );

  const handleLoadPreset = useCallback(
    (preset: Preset) => {
      setGridLayout(preset.state.grid);
      const restored = restoreChannels(preset.state.slots, channels);
      const needed = preset.state.grid;
      if (restored.length < needed) {
        while (restored.length < needed)
          restored.push({ channel: null, error: false, loading: false });
      }
      setSlots(restored.slice(0, needed));
    },
    [channels],
  );

  const handleDeletePreset = useCallback(
    (idx: number) => {
      const updated = presets.filter((_, i) => i !== idx);
      setPresets(updated);
      savePresets(updated);
    },
    [presets],
  );

  const handleUpdatePreset = useCallback(
    (idx: number) => {
      const state = buildSavedState(gridLayout, slots);
      const updated = presets.map((p, i) => (i === idx ? { ...p, state } : p));
      setPresets(updated);
      savePresets(updated);
    },
    [gridLayout, slots, presets],
  );

  const gridClass = useMemo(() => {
    if (promotedIdx !== null) return "grid-cols-1 grid-rows-1";
    switch (gridLayout) {
      case 1:
        return "grid-cols-1 grid-rows-1";
      case 2:
        return "grid-cols-1 grid-rows-2";
      case 4:
        return "grid-cols-2 grid-rows-2";
      case 9:
        return "grid-cols-3 grid-rows-3";
    }
  }, [gridLayout, promotedIdx]);

  const visibleSlots = useMemo(() => {
    if (promotedIdx !== null && slots[promotedIdx]) {
      return [{ slot: slots[promotedIdx]!, idx: promotedIdx }];
    }
    return slots.map((slot, idx) => ({ slot, idx }));
  }, [slots, promotedIdx]);

  return (
    <div
      ref={paneRef}
      className="w-full h-full flex flex-col bg-black overflow-hidden"
    >
      <div className="shrink-0 flex items-center justify-end gap-1.5 px-2 py-1 border-b border-sig-border/40 bg-sig-panel/80 relative">
        {/* Restore grid button */}
        {promotedIdx !== null && (
          <button
            onClick={handleRestoreGrid}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-sig-accent text-(length:--sig-text-sm) font-semibold tracking-wider bg-sig-accent/10 border border-sig-accent/30 hover:bg-sig-accent/20 transition-colors mr-auto"
          >
            <Minimize size={10} strokeWidth={2.5} />
            RESTORE{" "}
            {prePromoteGrid === 2
              ? "2×1"
              : prePromoteGrid === 4
                ? "2×2"
                : prePromoteGrid === 9
                  ? "3×3"
                  : "GRID"}
          </button>
        )}

        <div className="flex items-center gap-0.5">
          {([1, 2, 4, 9] as GridLayout[]).map((g) => (
            <button
              key={g}
              onClick={() => {
                setGridLayout(g);
                setPromotedIdx(null);
                setPrePromoteGrid(null);
              }}
              className={`p-1 rounded transition-colors border-none ${
                gridLayout === g
                  ? "text-sig-accent bg-sig-accent/15"
                  : "text-sig-dim bg-transparent hover:text-sig-bright"
              }`}
              title={
                g === 1 ? "Single" : g === 2 ? "2×1" : g === 4 ? "2×2" : "3×3"
              }
            >
              {g === 1 ? (
                <Square size={12} strokeWidth={2.5} />
              ) : g === 2 ? (
                <Columns2 size={12} strokeWidth={2.5} />
              ) : g === 4 ? (
                <LayoutGrid size={12} strokeWidth={2.5} />
              ) : (
                <svg
                  width={12}
                  height={12}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="1" y="1" width="6" height="6" />
                  <rect x="9" y="1" width="6" height="6" />
                  <rect x="17" y="1" width="6" height="6" />
                  <rect x="1" y="9" width="6" height="6" />
                  <rect x="9" y="9" width="6" height="6" />
                  <rect x="17" y="9" width="6" height="6" />
                  <rect x="1" y="17" width="6" height="6" />
                  <rect x="9" y="17" width="6" height="6" />
                  <rect x="17" y="17" width="6" height="6" />
                </svg>
              )}
            </button>
          ))}
        </div>
        <div className="w-px h-4 bg-sig-border/50" />
        {/* Presets button */}
        <button
          onClick={() => setShowPresets((v) => !v)}
          className={`p-1 rounded transition-colors border-none ${
            showPresets
              ? "text-sig-accent bg-sig-accent/15"
              : "text-sig-dim bg-transparent hover:text-sig-bright"
          }`}
          title="Presets"
        >
          <Bookmark size={12} strokeWidth={2.5} />
        </button>
        <span className="text-sig-dim text-(length:--sig-text-sm)">
          {loading ? (
            <Loader2 size={10} className="animate-spin" />
          ) : (
            `${channels.length} ch`
          )}
        </span>
        <div className="w-px h-4 bg-sig-border/50" />
        <button
          onClick={handlePaneFullscreen}
          className="p-1 rounded text-sig-dim bg-transparent border-none hover:text-sig-bright transition-colors"
          title="Fullscreen pane"
        >
          <Maximize size={12} strokeWidth={2.5} />
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
        {visibleSlots.map(({ slot, idx }) => (
          <VideoSlot
            key={`slot-${idx}`}
            slot={slot}
            slotIdx={idx}
            channels={channels}
            onAssign={assignChannel}
            onClear={clearSlot}
            onSlotError={slotError}
            onSlotLoaded={slotLoaded}
            muted={mutedSlot !== idx}
            onToggleMute={toggleMute}
            gridSize={promotedIdx !== null ? 1 : gridLayout}
            onPromote={gridLayout > 1 ? handlePromote : undefined}
          />
        ))}
      </div>
    </div>
  );
}

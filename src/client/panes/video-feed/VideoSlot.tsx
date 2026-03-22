import { useState, useEffect, useRef, useCallback } from "react";
import {
  Tv,
  ChevronDown,
  X,
  Volume2,
  VolumeX,
  Loader2,
  AlertTriangle,
  RefreshCw,
  Subtitles,
  Maximize,
  Radio,
  Minimize2,
} from "lucide-react";
import type {
  Channel,
  GridLayout,
  SlotState,
  PlayerHandle,
} from "./videoFeedTypes";
import { HlsPlayer } from "./HlsPlayer";
import { ChannelPicker } from "./ChannelPicker";

// ── Icons (custom SVG — visually distinct from Lucide) ──────────────

function PlayIcon({ className }: { readonly className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <polygon points="6,4 20,12 6,20" />
    </svg>
  );
}

function PauseIcon({ className }: { readonly className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <rect x="5" y="4" width="4" height="16" rx="1" />
      <rect x="15" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatDelay(seconds: number): string {
  if (seconds < 1) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `-${m}:${String(s).padStart(2, "0")}` : `-${s}s`;
}

// ── Component ───────────────────────────────────────────────────────

export function VideoSlot({
  slot,
  slotIdx,
  channels,
  onAssign,
  onClear,
  onSlotError,
  onSlotLoaded,
  muted,
  onToggleMute,
  gridSize,
  onPromote,
  onUnfocus,
}: {
  readonly slot: SlotState;
  readonly slotIdx: number;
  readonly channels: Channel[];
  readonly onAssign: (idx: number, ch: Channel) => void;
  readonly onClear: (idx: number) => void;
  readonly onSlotError: (idx: number) => void;
  readonly onSlotLoaded: (idx: number) => void;
  readonly muted: boolean;
  readonly onToggleMute: (idx: number) => void;
  readonly gridSize: GridLayout;
  readonly onPromote?: (idx: number) => void;
  readonly onUnfocus?: () => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [ccEnabled, setCcEnabled] = useState(false);
  const [localPaused, setLocalPaused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justShownRef = useRef(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<PlayerHandle | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const compact = gridSize > 1;

  // ── Controls show/hide with 5s auto-hide ──────────────────────
  const startHideTimer = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 5000);
  }, []);

  const showControls = useCallback(() => {
    if (!controlsVisible) {
      // First interaction after hidden — set flag to eat the click
      justShownRef.current = true;
      setTimeout(() => {
        justShownRef.current = false;
      }, 300);
    }
    setControlsVisible(true);
    startHideTimer();
  }, [controlsVisible, startHideTimer]);

  const resetTimer = useCallback(() => {
    startHideTimer();
  }, [startHideTimer]);

  // Keep visible when paused or picker open
  useEffect(() => {
    if (localPaused || showPicker) {
      setControlsVisible(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    } else {
      startHideTimer();
    }
  }, [localPaused, showPicker, startHideTimer]);

  // Show controls briefly on mount, then start hiding
  useEffect(() => {
    setControlsVisible(true);
    const t = setTimeout(() => setControlsVisible(false), 3000);
    return () => clearTimeout(t);
  }, []);

  // ── Outside click for picker ───────────────────────────────────
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node))
        setShowPicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPicker]);

  // ── Actions ────────────────────────────────────────────────────
  const handleFullscreen = useCallback(() => {
    // iOS Safari only supports fullscreen on <video> elements
    const video = playerRef.current?.getVideoElement?.();
    // @ts-ignore — webkitEnterFullscreen is iOS-specific
    if (video?.webkitEnterFullscreen) {
      // @ts-ignore
      video.webkitEnterFullscreen();
      return;
    }
    // Standard Fullscreen API for desktop/Android
    const el = slotRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  }, []);

  const handleTogglePause = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    if (localPaused) {
      p.play();
      setLocalPaused(false);
    } else {
      p.pause();
      setLocalPaused(true);
    }
  }, [localPaused]);

  const handleGoLive = useCallback(() => {
    const p = playerRef.current;
    if (!p) return;
    p.goLive();
    setLocalPaused(false);
  }, []);

  // ── Scrub via bar position ─────────────────────────────────────
  const seekFromPosition = useCallback((clientX: number) => {
    const p = playerRef.current;
    const bar = barRef.current;
    if (!p || !bar) return;
    const br = p.bufferRange;
    if (!br || br[1] - br[0] < 0.5) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    p.seekTo(br[0] + pct * (br[1] - br[0]));
  }, []);

  const handleBarMouseDown = useCallback(
    (e: React.MouseEvent) => {
      seekFromPosition(e.clientX);
      setIsDragging(true);
      const move = (mv: MouseEvent) => seekFromPosition(mv.clientX);
      const up = () => {
        setIsDragging(false);
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    },
    [seekFromPosition],
  );

  const handleBarTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches[0]) seekFromPosition(e.touches[0].clientX);
      setIsDragging(true);
      const move = (mv: TouchEvent) => {
        if (mv.touches[0]) seekFromPosition(mv.touches[0].clientX);
      };
      const end = () => {
        setIsDragging(false);
        document.removeEventListener("touchmove", move);
        document.removeEventListener("touchend", end);
      };
      document.addEventListener("touchmove", move, { passive: true });
      document.addEventListener("touchend", end);
    },
    [seekFromPosition],
  );

  // Guard: eat clicks when controls just appeared
  const guardClick = useCallback(
    (fn: () => void) => {
      return () => {
        if (justShownRef.current) return;
        resetTimer();
        fn();
      };
    },
    [resetTimer],
  );

  // ── Empty slot ─────────────────────────────────────────────────
  if (!slot.channel) {
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-sig-bg rounded overflow-hidden">
        <button
          onClick={() => setShowPicker(true)}
          className="flex flex-col items-center gap-2 text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors min-h-11 min-w-11"
        >
          <Tv size={compact ? 20 : 28} strokeWidth={1.5} />
          <span className="text-(length:--sig-text-sm) tracking-wider">
            SELECT CHANNEL
          </span>
        </button>
        {showPicker && (
          <ChannelPicker
            ref={pickerRef}
            channels={channels}
            onSelect={(ch) => {
              onAssign(slotIdx, ch);
              setShowPicker(false);
            }}
            onClose={() => setShowPicker(false)}
          />
        )}
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────
  if (slot.error) {
    return (
      <div className="relative w-full h-full flex flex-col items-center justify-center bg-sig-bg rounded overflow-hidden gap-2">
        <AlertTriangle size={20} className="text-sig-danger" />
        <span className="text-sig-dim text-(length:--sig-text-sm)">
          {slot.channel.name} — stream unavailable
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onAssign(slotIdx, slot.channel!)}
            className="flex items-center gap-1 px-3 py-2 rounded text-sig-accent text-(length:--sig-text-sm) bg-transparent border border-sig-accent/30 hover:bg-sig-accent/10 transition-colors min-h-11"
          >
            <RefreshCw size={12} /> RETRY
          </button>
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1 px-3 py-2 rounded text-sig-bright text-(length:--sig-text-sm) bg-transparent border border-sig-border hover:bg-sig-panel transition-colors min-h-11"
          >
            <ChevronDown size={12} /> CHANGE
          </button>
          <button
            onClick={() => onClear(slotIdx)}
            className="flex items-center gap-1 px-3 py-2 rounded text-sig-dim text-(length:--sig-text-sm) bg-transparent border border-sig-border hover:text-sig-danger transition-colors min-h-11"
          >
            <X size={12} /> CLOSE
          </button>
        </div>
        {showPicker && (
          <ChannelPicker
            ref={pickerRef}
            channels={channels}
            onSelect={(ch) => {
              onAssign(slotIdx, ch);
              setShowPicker(false);
            }}
            onClose={() => setShowPicker(false)}
          />
        )}
      </div>
    );
  }

  // ── Playing / Loading ──────────────────────────────────────────
  const player = playerRef.current;
  const isLive = player?.isLive ?? true;
  const delay = player?.currentDelay ?? 0;
  const bufferRange = player?.bufferRange ?? null;
  const currentTime = player?.currentTime ?? 0;

  const hasRange = bufferRange != null && bufferRange[1] - bufferRange[0] > 0.5;
  const progressPct = hasRange
    ? Math.max(
        0,
        Math.min(
          100,
          ((currentTime - bufferRange![0]) /
            (bufferRange![1] - bufferRange![0])) *
            100,
        ),
      )
    : 100;

  const showBar = localPaused || (!isLive && delay > 2);

  return (
    <div
      ref={slotRef}
      className="relative w-full h-full bg-sig-bg rounded overflow-hidden"
      onClick={showControls}
      onMouseMove={showControls}
    >
      {slot.loading && (
        <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/70">
          <Loader2 size={20} className="text-sig-accent animate-spin" />
        </div>
      )}

      <HlsPlayer
        channel={slot.channel}
        muted={muted}
        ccEnabled={ccEnabled}
        onError={() => onSlotError(slotIdx)}
        onLoaded={() => onSlotLoaded(slotIdx)}
        playerRef={playerRef}
      />

      {/* ── Paused overlay ─────────────────────────────────────── */}
      {localPaused && !slot.loading && (
        <div
          className="absolute inset-x-0 top-0 bottom-20 flex items-center justify-center z-10 bg-black/40"
          onClick={(e) => {
            e.stopPropagation();
            handleTogglePause();
          }}
        >
          <button className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 active:bg-white/40 transition-colors border-none">
            <PlayIcon className="w-8 h-8 ml-1" />
          </button>
        </div>
      )}

      {/* ── Bottom controls ───────────────────────────────────── */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 to-transparent px-2 pt-6 pb-1.5 video-controls ${controlsVisible ? "video-controls-visible" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Progress bar ─────────────────────────────────────── */}
        {showBar && hasRange && (
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-yellow-400 text-[10px] font-semibold tracking-wider tabular-nums shrink-0 min-w-12">
              {localPaused ? "PAUSED" : formatDelay(delay)}
            </span>
            <div
              ref={barRef}
              className="flex-1 relative cursor-pointer"
              style={{ height: 44, touchAction: "none" }}
              onMouseDown={handleBarMouseDown}
              onTouchStart={handleBarTouchStart}
            >
              <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-white/20 overflow-hidden">
                <div
                  className="h-full bg-yellow-400 rounded-full"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div
                className={`absolute top-1/2 -translate-y-1/2 rounded-full bg-yellow-400 shadow transition-transform ${isDragging ? "scale-125" : ""}`}
                style={{
                  width: 20,
                  height: 20,
                  left: `calc(${progressPct}% - 10px)`,
                }}
              />
            </div>
            <button
              onClick={guardClick(handleGoLive)}
              className={`text-[10px] font-bold tracking-wider bg-transparent border-none transition-colors shrink-0 min-h-11 min-w-11 flex items-center justify-center ${
                isLive && !localPaused
                  ? "text-sig-danger"
                  : "text-yellow-400 hover:text-white"
              }`}
            >
              {isLive && !localPaused ? (
                <span className="flex items-center gap-0.5">
                  <Radio size={8} /> LIVE
                </span>
              ) : (
                "GO LIVE"
              )}
            </button>
          </div>
        )}

        {/* ── Button row ───────────────────────────────────────── */}
        <div className="flex items-center gap-0.5">
          {slot.channel.logo && (
            <img
              src={slot.channel.logo}
              alt=""
              className="w-4 h-4 rounded-sm object-contain bg-white/10 shrink-0"
              loading="lazy"
            />
          )}
          <span className="text-white text-(length:--sig-text-sm) font-semibold truncate flex-1 tracking-wide ml-1">
            {slot.channel.name}
          </span>

          {/* LIVE badge */}
          {isLive && !localPaused && !showBar && (
            <span className="flex items-center gap-0.5 text-sig-danger text-[9px] font-bold tracking-wider shrink-0 mr-1">
              <Radio size={8} className="animate-[pulse_1.5s_infinite]" /> LIVE
            </span>
          )}

          {/* Play / Pause */}
          <button
            onClick={guardClick(handleTogglePause)}
            title={localPaused ? "Play" : "Pause"}
            className={`bg-transparent border-none transition-colors min-h-11 min-w-11 flex items-center justify-center rounded ${localPaused ? "text-yellow-400" : "text-white/80"}`}
          >
            {localPaused ? (
              <PlayIcon className="w-5 h-5" />
            ) : (
              <PauseIcon className="w-5 h-5" />
            )}
          </button>

          {/* Mute */}
          <button
            onClick={guardClick(() => onToggleMute(slotIdx))}
            title={muted ? "Unmute" : "Mute"}
            className="text-white/80 bg-transparent border-none transition-colors min-h-11 min-w-11 flex items-center justify-center"
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>

          {/* CC */}
          <button
            onClick={guardClick(() => setCcEnabled((v) => !v))}
            title={ccEnabled ? "Hide captions" : "Captions"}
            className={`bg-transparent border-none transition-colors min-h-11 min-w-11 flex items-center justify-center ${ccEnabled ? "text-sig-accent" : "text-white/80"}`}
          >
            <Subtitles size={18} />
          </button>

          {/* Focus this channel (grid mode) — Minimize2 icon distinct from Maximize */}
          {onPromote && compact && (
            <button
              onClick={guardClick(() => onPromote(slotIdx))}
              title="Focus channel"
              className="text-white/80 bg-transparent border-none transition-colors min-h-11 min-w-11 flex items-center justify-center"
            >
              <Minimize2 size={18} />
            </button>
          )}

          {/* Unfocus — restore grid (shown when this slot is promoted to 1×1) */}
          {onUnfocus && !compact && (
            <button
              onClick={guardClick(onUnfocus)}
              title="Restore grid"
              className="text-sig-accent bg-transparent border-none transition-colors min-h-11 min-w-11 flex items-center justify-center"
            >
              <Minimize2 size={18} />
            </button>
          )}

          {/* Browser fullscreen */}
          <button
            onClick={guardClick(handleFullscreen)}
            title="Fullscreen"
            className="text-white/80 bg-transparent border-none transition-colors min-h-11 min-w-11 flex items-center justify-center"
          >
            <Maximize size={18} />
          </button>

          {/* Change channel */}
          <button
            onClick={guardClick(() => setShowPicker(true))}
            title="Change channel"
            className="text-white/80 bg-transparent border-none transition-colors min-h-11 min-w-11 flex items-center justify-center"
          >
            <ChevronDown size={18} />
          </button>

          {/* Close */}
          <button
            onClick={guardClick(() => onClear(slotIdx))}
            title="Close"
            className="text-white/80 bg-transparent border-none hover:text-sig-danger transition-colors min-h-11 min-w-11 flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Compact channel label (grid mode) */}
      {compact && (
        <div className="absolute top-0 left-0 px-1.5 py-0.5 bg-black/60 rounded-br">
          <span className="text-white/80 text-[9px] tracking-wider font-semibold truncate max-w-20 block">
            {slot.channel.name}
          </span>
        </div>
      )}

      {/* Channel picker overlay */}
      {showPicker && (
        <ChannelPicker
          ref={pickerRef}
          channels={channels}
          onSelect={(ch) => {
            onAssign(slotIdx, ch);
            setShowPicker(false);
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

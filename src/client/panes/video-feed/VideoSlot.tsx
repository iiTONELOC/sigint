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
  Play,
  Pause,
  Radio,
  Scan,
} from "lucide-react";
import type { Channel, GridLayout, SlotState, PlayerHandle } from "./videoFeedTypes";
import { DVR_BACK_BUFFER } from "./videoFeedTypes";
import { HlsPlayer } from "./HlsPlayer";
import { ChannelPicker } from "./ChannelPicker";

function formatDelay(seconds: number): string {
  if (seconds < 1) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `-${m}:${String(s).padStart(2, "0")}` : `-${s}s`;
}

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
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [ccEnabled, setCcEnabled] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<PlayerHandle | null>(null);
  const compact = gridSize > 1;

  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node))
        setShowPicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPicker]);

  const handleFullscreen = useCallback(() => {
    const el = slotRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      el.requestFullscreen().catch(() => {});
    }
  }, []);

  // ── Empty slot ─────────────────────────────────────────────────
  if (!slot.channel) {
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-black/50 border border-sig-border/30 rounded overflow-hidden">
        <button
          onClick={() => setShowPicker(true)}
          className="flex flex-col items-center gap-2 text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors"
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
      <div className="relative w-full h-full flex flex-col items-center justify-center bg-black/80 border border-sig-border/30 rounded overflow-hidden gap-2">
        <AlertTriangle size={20} className="text-sig-danger" />
        <span className="text-sig-dim text-(length:--sig-text-sm)">
          {slot.channel.name} — stream unavailable
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onAssign(slotIdx, slot.channel!)}
            className="flex items-center gap-1 px-2 py-1 rounded text-sig-accent text-(length:--sig-text-sm) bg-transparent border border-sig-accent/30 hover:bg-sig-accent/10 transition-colors"
          >
            <RefreshCw size={10} /> RETRY
          </button>
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1 px-2 py-1 rounded text-sig-bright text-(length:--sig-text-sm) bg-transparent border border-sig-border hover:bg-sig-panel transition-colors"
          >
            <ChevronDown size={10} /> CHANGE
          </button>
          <button
            onClick={() => onClear(slotIdx)}
            className="flex items-center gap-1 px-2 py-1 rounded text-sig-dim text-(length:--sig-text-sm) bg-transparent border border-sig-border hover:text-sig-danger transition-colors"
          >
            <X size={10} /> CLOSE
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

  // ── Playing / Loading state ────────────────────────────────────
  const player = playerRef.current;
  const isPaused = player?.isPaused ?? false;
  const isLive = player?.isLive ?? true;
  const delay = player?.currentDelay ?? 0;

  return (
    <div
      ref={slotRef}
      className="relative w-full h-full bg-black border border-sig-border/30 rounded overflow-hidden group"
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

      {/* Controls — always visible on touch, hover-reveal on desktop */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity px-2 pt-4 pb-1.5">
        {/* DVR bar — shows when not live */}
        {!isLive && delay > 2 && (
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-yellow-400 text-[9px] font-semibold tracking-wider tabular-nums shrink-0">
              {formatDelay(delay)}
            </span>
            <div className="flex-1 h-0.5 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-yellow-400/60 rounded-full"
                style={{
                  width: `${Math.max(2, 100 - (delay / DVR_BACK_BUFFER) * 100)}%`,
                }}
              />
            </div>
            <button
              onClick={() => player?.goLive()}
              className="text-yellow-400 text-[9px] font-bold tracking-wider bg-transparent border-none hover:text-white transition-colors shrink-0"
            >
              GO LIVE
            </button>
          </div>
        )}

        {/* Main control row */}
        <div className="flex items-center gap-1.5">
          {slot.channel.logo && (
            <img
              src={slot.channel.logo}
              alt=""
              className="w-4 h-4 rounded-sm object-contain bg-white/10 shrink-0"
              loading="lazy"
            />
          )}
          <span className="text-white text-(length:--sig-text-sm) font-semibold truncate flex-1 tracking-wide">
            {slot.channel.name}
          </span>

          {/* Live indicator */}
          {isLive && !isPaused && (
            <span className="flex items-center gap-0.5 text-sig-danger text-[8px] font-bold tracking-wider shrink-0">
              <Radio size={8} className="animate-[pulse_1.5s_infinite]" /> LIVE
            </span>
          )}

          {/* Pause/Play */}
          <button
            onClick={() => (isPaused ? player?.play() : player?.pause())}
            className="text-white/70 bg-transparent border-none hover:text-white transition-colors p-0.5"
            title={isPaused ? "Play" : "Pause (DVR buffer: 5 min)"}
          >
            {isPaused ? <Play size={12} /> : <Pause size={12} />}
          </button>

          {/* Mute toggle */}
          <button
            onClick={() => onToggleMute(slotIdx)}
            className="text-white/70 bg-transparent border-none hover:text-white transition-colors p-0.5"
            title={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX size={12} /> : <Volume2 size={12} />}
          </button>

          {/* CC */}
          <button
            onClick={() => setCcEnabled((v) => !v)}
            className={`bg-transparent border-none transition-colors p-0.5 ${ccEnabled ? "text-sig-accent" : "text-white/70 hover:text-white"}`}
            title={ccEnabled ? "Hide captions" : "Show captions"}
          >
            <Subtitles size={12} />
          </button>

          {/* Promote to 1×1 (only in grid mode) */}
          {onPromote && compact && (
            <button
              onClick={() => onPromote(slotIdx)}
              className="text-white/70 bg-transparent border-none hover:text-white transition-colors p-0.5"
              title="Focus this channel"
            >
              <Scan size={12} />
            </button>
          )}

          {/* Browser fullscreen */}
          <button
            onClick={handleFullscreen}
            className="text-white/70 bg-transparent border-none hover:text-white transition-colors p-0.5"
            title="Fullscreen"
          >
            <Maximize size={12} />
          </button>

          {/* Change channel */}
          <button
            onClick={() => setShowPicker(true)}
            className="text-white/70 bg-transparent border-none hover:text-white transition-colors p-0.5"
            title="Change channel"
          >
            <ChevronDown size={12} />
          </button>

          {/* Close */}
          <button
            onClick={() => onClear(slotIdx)}
            className="text-white/70 bg-transparent border-none hover:text-sig-danger transition-colors p-0.5"
            title="Close"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {compact && (
        <div className="absolute top-0 left-0 px-1.5 py-0.5 bg-black/60 rounded-br">
          <span className="text-white/80 text-[9px] tracking-wider font-semibold truncate max-w-20 block">
            {slot.channel.name}
          </span>
        </div>
      )}

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

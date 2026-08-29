import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react";
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
  Focus,
  LayoutGrid,
  Pause,
  Play,
} from "lucide-react";
import { ButtonType } from "@/lib/ui/button";
import { cn } from "@/lib/ui/utils";
import { DomEvent, DomInputType } from "@/runtime";
import type {
  Channel,
  ChannelCatalog,
  GridLayout,
  SlotState,
  PlayerHandle,
} from "./videoFeedTypes";
import { HlsPlayer } from "./HlsPlayer";
import { ChannelPicker } from "./ChannelPicker";

enum VideoSlotMetric {
  ControlIconSize = 18,
  EmptyIconSize = 28,
  LiveDelayThresholdSeconds = 2,
  MicroIconSize = 8,
  MinimumSeekRangeSeconds = 0.5,
  SmallIconSize = 12,
  StatusIconSize = 20,
  StrokeWidth = 1.5,
}

enum VideoSlotClassName {
  AccentTone = "text-sig-accent",
  CompactRow = "flex items-center gap-0.5",
  Control = "video-control text-white/80 bg-transparent border-none transition-colors flex items-center justify-center",
  DangerTone = "text-sig-danger",
  MutedTone = "text-white/80",
}

type VideoControlButtonProps = Readonly<{
  children: ReactNode;
  className?: string;
  onClick: () => void;
  title: string;
}>;

function VideoControlButton({
  children,
  className,
  onClick,
  title,
}: VideoControlButtonProps) {
  return (
    <button
      type={ButtonType.Button}
      className={cn(VideoSlotClassName.Control, className)}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

type PlaybackControlsProps = Readonly<{
  captionsEnabled: boolean;
  muted: boolean;
  onToggleCaptions: () => void;
  onToggleMute: () => void;
  onTogglePause: () => void;
  paused: boolean;
}>;

function PlaybackControls({
  captionsEnabled,
  muted,
  onToggleCaptions,
  onToggleMute,
  onTogglePause,
  paused,
}: PlaybackControlsProps) {
  return (
    <>
      <VideoControlButton
        onClick={onTogglePause}
        title={paused ? "Play" : "Pause"}
        className={paused ? "text-sig-warn" : undefined}
      >
        {paused ? (
          <Play size={VideoSlotMetric.StatusIconSize} />
        ) : (
          <Pause size={VideoSlotMetric.StatusIconSize} />
        )}
      </VideoControlButton>
      <VideoControlButton
        onClick={onToggleMute}
        title={muted ? "Unmute" : "Mute"}
      >
        {muted ? (
          <VolumeX size={VideoSlotMetric.ControlIconSize} />
        ) : (
          <Volume2 size={VideoSlotMetric.ControlIconSize} />
        )}
      </VideoControlButton>
      <VideoControlButton
        onClick={onToggleCaptions}
        title={captionsEnabled ? "Hide captions" : "Captions"}
        className={
          captionsEnabled ? VideoSlotClassName.AccentTone : undefined
        }
      >
        <Subtitles size={VideoSlotMetric.ControlIconSize} />
      </VideoControlButton>
    </>
  );
}

function formatDelay(seconds: number): string {
  if (seconds < 1) return "";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return minutes > 0
    ? `-${minutes}:${String(remainingSeconds).padStart(2, "0")}`
    : `-${remainingSeconds}s`;
}

function toggleFullscreen(
  slot: HTMLDivElement | null,
  video: HTMLVideoElement | null,
): void {
  if (
    video &&
    "webkitEnterFullscreen" in video &&
    typeof video.webkitEnterFullscreen === "function"
  ) {
    video.webkitEnterFullscreen();
    return;
  }
  if (!slot) return;
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
    return;
  }
  slot.requestFullscreen().catch(() => {});
}

export function VideoSlot({
  slot,
  slotIndex,
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
  readonly slotIndex: number;
  readonly channels: ChannelCatalog;
  readonly onAssign: (slotIndex: number, channel: Channel) => void;
  readonly onClear: (slotIndex: number) => void;
  readonly onSlotError: (slotIndex: number) => void;
  readonly onSlotLoaded: (slotIndex: number) => void;
  readonly muted: boolean;
  readonly onToggleMute: (slotIndex: number) => void;
  readonly gridSize: GridLayout;
  readonly onPromote?: (slotIndex: number) => void;
  readonly onUnfocus?: () => void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [ccEnabled, setCcEnabled] = useState(false);
  const [localPaused, setLocalPaused] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<PlayerHandle | null>(null);
  const compact = gridSize > 1;

  useEffect(() => {
    if (!showPicker) return;
    const handler = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        pickerRef.current &&
        !pickerRef.current.contains(event.target)
      ) {
        setShowPicker(false);
      }
    };
    document.addEventListener(DomEvent.MouseDown, handler);
    return () => document.removeEventListener(DomEvent.MouseDown, handler);
  }, [showPicker]);

  const handleFullscreen = useCallback(() => {
    toggleFullscreen(
      slotRef.current,
      playerRef.current?.getVideoElement() ?? null,
    );
  }, []);

  const handleTogglePause = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    if (localPaused) {
      player.play();
      setLocalPaused(false);
    } else {
      player.pause();
      setLocalPaused(true);
    }
  }, [localPaused]);

  const handleGoLive = useCallback(() => {
    const player = playerRef.current;
    if (!player) return;
    player.goLive();
    setLocalPaused(false);
  }, []);

  const handleSeek = useCallback(
    (time: number) => {
      playerRef.current?.seekTo(time);
    },
    [],
  );

  const handleChannelSelect = useCallback(
    (channel: Channel) => {
      onAssign(slotIndex, channel);
      setShowPicker(false);
    },
    [onAssign, slotIndex],
  );

  const handlePlayerError = useCallback(
    () => onSlotError(slotIndex),
    [onSlotError, slotIndex],
  );
  const handlePlayerLoaded = useCallback(
    () => onSlotLoaded(slotIndex),
    [onSlotLoaded, slotIndex],
  );

  const picker = showPicker ? (
    <ChannelPicker
      ref={pickerRef}
      channels={channels}
      onSelect={handleChannelSelect}
      onClose={() => setShowPicker(false)}
    />
  ) : null;

  const channel = slot.channel;

  if (!channel) {
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-sig-bg rounded overflow-hidden">
        <button
          type={ButtonType.Button}
          onClick={() => setShowPicker(true)}
          className="video-control flex flex-col items-center gap-2 text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors"
        >
          <Tv
            size={
              compact
                ? VideoSlotMetric.StatusIconSize
                : VideoSlotMetric.EmptyIconSize
            }
            strokeWidth={VideoSlotMetric.StrokeWidth}
          />
          <span className="text-(length:--sig-text-sm) tracking-wider">
            SELECT CHANNEL
          </span>
        </button>
        {picker}
      </div>
    );
  }

  if (slot.error) {
    return (
      <div className="relative w-full h-full flex flex-col items-center justify-center bg-sig-bg rounded overflow-hidden gap-2">
        <AlertTriangle
          size={VideoSlotMetric.StatusIconSize}
          className={VideoSlotClassName.DangerTone}
        />
        <span className="text-sig-dim text-(length:--sig-text-sm)">
          {channel.name}: stream unavailable
        </span>
        <div className="flex items-center gap-2">
          <button
            type={ButtonType.Button}
            onClick={() => onAssign(slotIndex, channel)}
            className="video-action flex items-center gap-1 px-3 py-2 rounded text-sig-accent text-(length:--sig-text-sm) bg-transparent border border-sig-accent/30 hover:bg-sig-accent/10 transition-colors"
          >
            <RefreshCw size={VideoSlotMetric.SmallIconSize} /> RETRY
          </button>
          <button
            type={ButtonType.Button}
            onClick={() => setShowPicker(true)}
            className="video-action flex items-center gap-1 px-3 py-2 rounded text-sig-bright text-(length:--sig-text-sm) bg-transparent border border-sig-border hover:bg-sig-panel transition-colors"
          >
            <ChevronDown size={VideoSlotMetric.SmallIconSize} /> CHANGE
          </button>
          <button
            type={ButtonType.Button}
            onClick={() => onClear(slotIndex)}
            className="video-action flex items-center gap-1 px-3 py-2 rounded text-sig-dim text-(length:--sig-text-sm) bg-transparent border border-sig-border hover:text-sig-danger transition-colors"
          >
            <X size={VideoSlotMetric.SmallIconSize} /> CLOSE
          </button>
        </div>
        {picker}
      </div>
    );
  }

  const player = playerRef.current;
  const isLive = player?.isLive ?? true;
  const delay = player?.currentDelay ?? 0;
  const bufferRange = player?.bufferRange ?? null;
  const currentTime = player?.currentTime ?? 0;

  const rangeStart = bufferRange?.[0] ?? 0;
  const rangeEnd = bufferRange?.[1] ?? 0;
  const hasRange =
    rangeEnd - rangeStart > VideoSlotMetric.MinimumSeekRangeSeconds;
  const seekTime = Math.max(rangeStart, Math.min(rangeEnd, currentTime));

  const showBar =
    localPaused ||
    (!isLive && delay > VideoSlotMetric.LiveDelayThresholdSeconds);

  return (
    <div
      ref={slotRef}
      className="video-slot relative w-full h-full bg-sig-bg rounded overflow-hidden"
      data-controls-visible={localPaused || showPicker}
    >
      {slot.loading && (
        <div className="absolute inset-0 flex items-center justify-center z-(--layer-content) bg-black/70">
          <Loader2
            size={VideoSlotMetric.StatusIconSize}
            className="text-sig-accent animate-spin"
          />
        </div>
      )}

      <HlsPlayer
        channel={channel}
        muted={muted}
        ccEnabled={ccEnabled}
        onError={handlePlayerError}
        onLoaded={handlePlayerLoaded}
        playerRef={playerRef}
      />

      {localPaused && !slot.loading && (
        <button
          type={ButtonType.Button}
          aria-label="Resume video"
          className="absolute inset-x-0 top-0 bottom-20 flex items-center justify-center z-(--layer-content) bg-black/40 border-0"
          onClick={handleTogglePause}
        >
          <span className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center hover:bg-white/30 active:bg-white/40 transition-colors">
            <Play size={VideoSlotMetric.EmptyIconSize} className="ml-1" />
          </span>
        </button>
      )}

      <div
        className="video-controls absolute inset-x-0 bottom-0 z-(--layer-pane-overlay) bg-linear-to-t from-black/80 to-transparent px-2 pt-6 pb-1.5"
      >
        {showBar && hasRange && (
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sig-warn text-(length:--sig-text-sm) font-semibold tracking-wider tabular-nums shrink-0 min-w-12">
              {localPaused ? "PAUSED" : formatDelay(delay)}
            </span>
            <input
              key={`${rangeStart}:${rangeEnd}`}
              type={DomInputType.Range}
              aria-label="Seek video"
              min={rangeStart}
              max={rangeEnd}
              defaultValue={seekTime}
              step="any"
              onInput={(event) => handleSeek(event.currentTarget.valueAsNumber)}
              className="video-seek flex-1 cursor-pointer accent-sig-warn"
            />
            <button
              type={ButtonType.Button}
              onClick={handleGoLive}
              className={cn(
                "video-control text-(length:--sig-text-sm) font-bold tracking-wider bg-transparent border-none transition-colors shrink-0 flex items-center justify-center",
                isLive && !localPaused
                  ? VideoSlotClassName.DangerTone
                  : "text-sig-warn hover:text-white",
              )}
            >
              {isLive && !localPaused ? (
                <span className="flex items-center gap-0.5">
                  <Radio size={VideoSlotMetric.MicroIconSize} /> LIVE
                </span>
              ) : (
                "GO LIVE"
              )}
            </button>
          </div>
        )}

        <div className={VideoSlotClassName.CompactRow}>
          {channel.logo && (
            <img
              src={channel.logo}
              alt=""
              className="w-4 h-4 rounded-sm object-contain bg-white/10 shrink-0"
              loading="lazy"
            />
          )}
          <span className="text-white text-(length:--sig-text-sm) font-semibold truncate flex-1 tracking-wide ml-1">
            {channel.name}
          </span>

          {isLive && !localPaused && !showBar && (
            <span
              className={cn(
                VideoSlotClassName.CompactRow,
                "text-(length:--sig-text-xs) font-bold tracking-wider shrink-0 mr-1",
                VideoSlotClassName.DangerTone,
              )}
            >
              <Radio
                size={VideoSlotMetric.SmallIconSize}
                className="animate-pulse"
              />{" "}
              LIVE
            </span>
          )}

          <PlaybackControls
            captionsEnabled={ccEnabled}
            muted={muted}
            onToggleCaptions={() => setCcEnabled((enabled) => !enabled)}
            onToggleMute={() => onToggleMute(slotIndex)}
            onTogglePause={handleTogglePause}
            paused={localPaused}
          />

          {onPromote && compact && (
            <VideoControlButton
              onClick={() => onPromote(slotIndex)}
              title="Focus channel"
            >
              <Focus size={VideoSlotMetric.ControlIconSize} />
            </VideoControlButton>
          )}

          {onUnfocus && !compact && (
            <VideoControlButton
              onClick={onUnfocus}
              title="Restore grid"
              className={VideoSlotClassName.AccentTone}
            >
              <LayoutGrid size={VideoSlotMetric.ControlIconSize} />
            </VideoControlButton>
          )}

          <VideoControlButton onClick={handleFullscreen} title="Fullscreen">
            <Maximize size={VideoSlotMetric.ControlIconSize} />
          </VideoControlButton>

          <VideoControlButton
            onClick={() => setShowPicker(true)}
            title="Change channel"
          >
            <ChevronDown size={VideoSlotMetric.ControlIconSize} />
          </VideoControlButton>

          <VideoControlButton
            onClick={() => onClear(slotIndex)}
            title="Close"
            className="hover:text-sig-danger"
          >
            <X size={VideoSlotMetric.ControlIconSize} />
          </VideoControlButton>
        </div>
      </div>

      {compact && (
        <div className="absolute top-0 left-0 px-1.5 py-0.5 bg-black/60 rounded-br">
          <span
            className={cn(
              "text-(length:--sig-text-xs) tracking-wider font-semibold truncate max-w-20 block",
              VideoSlotClassName.MutedTone,
            )}
          >
            {channel.name}
          </span>
        </div>
      )}

      {picker}
    </div>
  );
}

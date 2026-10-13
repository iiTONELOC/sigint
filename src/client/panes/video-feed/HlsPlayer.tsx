import { useEffect, useRef, type RefObject } from "react";
import Hls from "hls.js";
import { DomEvent } from "@/runtime";
import type { Channel } from "@shared/domain/videoChannel";
import type { PlayerHandle } from "./videoFeedTypes";

enum HlsPlayerMetric {
  DvrWindowSeconds = 300,
  LiveToleranceSeconds = 3,
  LoadTimeoutMilliseconds = 15_000,
  NetworkRetryLimit = 2,
}

const PLAYBACK_EVENTS: readonly DomEvent[] = [
  DomEvent.Pause,
  DomEvent.Play,
  DomEvent.Progress,
  DomEvent.Seeked,
  DomEvent.TimeUpdate,
];

export type LivePlayback = Readonly<{ delay: number; live: boolean }>;

export function livePlayback(
  edge: number | null,
  time: number,
  paused: boolean,
): LivePlayback {
  const delay = edge === null ? 0 : Math.max(0, edge - time);
  return { delay, live: !paused && delay <= HlsPlayerMetric.LiveToleranceSeconds };
}

function liveEdge(video: HTMLVideoElement, hls: Hls | null): number | null {
  const synced = hls?.liveSyncPosition;
  if (typeof synced === "number") return synced;
  return video.seekable.length > 0
    ? video.seekable.end(video.seekable.length - 1)
    : null;
}

type HlsPlayerProps = Readonly<{
  channel: Channel;
  muted: boolean;
  ccEnabled: boolean;
  onError: () => void;
  onLoaded: () => void;
  onTick: () => void;
  playerRef: RefObject<PlayerHandle | null>;
}>;

export function HlsPlayer({
  channel,
  muted,
  ccEnabled,
  onError,
  onLoaded,
  onTick,
  playerRef,
}: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const errorFired = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    playerRef.current = {
      get isLive() {
        return livePlayback(liveEdge(video, hlsRef.current), video.currentTime, video.paused).live;
      },
      get currentDelay() {
        return livePlayback(liveEdge(video, hlsRef.current), video.currentTime, video.paused).delay;
      },
      play() {
        video.play().catch(() => {});
      },
      pause() {
        video.pause();
      },
      goLive() {
        const hls = hlsRef.current;
        const edge = liveEdge(video, hls);
        if (edge === null) hls?.startLoad(-1);
        else video.currentTime = edge;
        video.play().catch(() => {});
      },
      get bufferRange(): [number, number] | null {
        if (video.seekable.length > 0) {
          return [
            video.seekable.start(0),
            video.seekable.end(video.seekable.length - 1),
          ];
        }
        if (video.buffered.length > 0) {
          return [
            video.buffered.start(0),
            video.buffered.end(video.buffered.length - 1),
          ];
        }
        return null;
      },
      get currentTime() {
        return video.currentTime;
      },
      seekTo(time: number) {
        video.currentTime = time;
      },
      getVideoElement() {
        return video;
      },
    };
    return () => {
      playerRef.current = null;
    };
  }, [playerRef]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    errorFired.current = false;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const fireError = (): void => {
      if (!errorFired.current) {
        errorFired.current = true;
        onError();
      }
    };
    const startPlayback = (): void => {
      onLoaded();
      video.play().catch(() => {});
    };
    const scheduleLoadTimeout = (): ReturnType<typeof setTimeout> =>
      setTimeout(() => {
        if (
          !errorFired.current &&
          video.readyState < video.HAVE_CURRENT_DATA
        ) {
          fireError();
        }
      }, HlsPlayerMetric.LoadTimeoutMilliseconds);

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        maxBufferLength: HlsPlayerMetric.DvrWindowSeconds,
        maxMaxBufferLength: HlsPlayerMetric.DvrWindowSeconds,
        backBufferLength: HlsPlayerMetric.DvrWindowSeconds,
        // Cross-origin streams must not send or accept cookies.
        xhrSetup: (xhr) => {
          xhr.withCredentials = false;
        },
        fetchSetup: (context, initParams) => {
          return new Request(context.url, {
            ...initParams,
            credentials: "omit",
          });
        },
      });
      hls.loadSource(channel.url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, startPlayback);

      let networkRetries = 0;
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          if (
            data.type === Hls.ErrorTypes.NETWORK_ERROR &&
            networkRetries < HlsPlayerMetric.NetworkRetryLimit
          ) {
            networkRetries += 1;
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            fireError();
          }
        }
      });

      const timeout = scheduleLoadTimeout();

      hlsRef.current = hls;
      return () => {
        clearTimeout(timeout);
        hls.destroy();
        hlsRef.current = null;
      };
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = channel.url;
      video.addEventListener(DomEvent.LoadedMetadata, startPlayback);
      video.addEventListener(DomEvent.Error, fireError);
      const timeout = scheduleLoadTimeout();
      return () => {
        clearTimeout(timeout);
        video.removeEventListener(DomEvent.LoadedMetadata, startPlayback);
        video.removeEventListener(DomEvent.Error, fireError);
        video.src = "";
      };
    }

    fireError();
  }, [channel.url, onError, onLoaded]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    for (const event of PLAYBACK_EVENTS) video.addEventListener(event, onTick);
    return () => {
      for (const event of PLAYBACK_EVENTS) video.removeEventListener(event, onTick);
    };
  }, [onTick]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const update = () => {
      for (const track of video.textTracks) {
        track.mode = ccEnabled ? "showing" : "hidden";
      }
    };
    update();
    video.textTracks.addEventListener(DomEvent.AddTrack, update);
    return () =>
      video.textTracks.removeEventListener(DomEvent.AddTrack, update);
  }, [ccEnabled]);

  return (
    <video
      ref={videoRef}
      muted={muted}
      autoPlay
      playsInline
      className="w-full h-full object-contain bg-sig-bg"
    />
  );
}

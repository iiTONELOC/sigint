import { useEffect, useRef, type RefObject } from "react";
import Hls from "hls.js";
import { DomEvent } from "@/runtime";
import type { Channel, PlayerHandle } from "./videoFeedTypes";

enum HlsPlayerMetric {
  BackBufferSeconds = 300,
  BufferSeconds = 10,
  LiveEdgeOffsetSeconds = 0.5,
  LoadTimeoutMilliseconds = 15_000,
  MaximumBufferSeconds = 30,
  NetworkRetryLimit = 2,
  UnknownDurationSeconds = 10_000_000_000,
}

type HlsPlayerProps = Readonly<{
  channel: Channel;
  muted: boolean;
  ccEnabled: boolean;
  onError: () => void;
  onLoaded: () => void;
  playerRef: RefObject<PlayerHandle | null>;
}>;

export function HlsPlayer({
  channel,
  muted,
  ccEnabled,
  onError,
  onLoaded,
  playerRef,
}: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const errorFired = useRef(false);
  const userSeekedRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    playerRef.current = {
      get isLive() {
        return !userSeekedRef.current;
      },
      get currentDelay() {
        if (video.buffered.length === 0) return 0;
        const bufEnd = video.buffered.end(video.buffered.length - 1);
        return Math.max(0, bufEnd - video.currentTime);
      },
      play() {
        video.play().catch(() => {});
      },
      pause() {
        video.pause();
      },
      goLive() {
        const hls = hlsRef.current;
        if (hls) {
          hls.startLoad(-1);
        }
        if (video.buffered.length > 0) {
          const liveEdge = video.buffered.end(video.buffered.length - 1);
          video.currentTime =
            liveEdge - HlsPlayerMetric.LiveEdgeOffsetSeconds;
        } else if (Number.isFinite(video.duration)) {
          video.currentTime = video.duration;
        } else {
          video.currentTime = HlsPlayerMetric.UnknownDurationSeconds;
        }
        userSeekedRef.current = false;
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
        userSeekedRef.current = true;
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
        maxBufferLength: HlsPlayerMetric.BufferSeconds,
        maxMaxBufferLength: HlsPlayerMetric.MaximumBufferSeconds,
        backBufferLength: HlsPlayerMetric.BackBufferSeconds,
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

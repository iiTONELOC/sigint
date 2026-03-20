import { useState, useEffect, useRef } from "react";
import Hls from "hls.js";
import type { Channel, PlayerHandle } from "./videoFeedTypes";
import { DVR_BACK_BUFFER } from "./videoFeedTypes";

export function HlsPlayer({
  channel,
  muted,
  ccEnabled,
  onError,
  onLoaded,
  playerRef,
}: {
  readonly channel: Channel;
  readonly muted: boolean;
  readonly ccEnabled: boolean;
  readonly onError: () => void;
  readonly onLoaded: () => void;
  readonly playerRef?: React.MutableRefObject<PlayerHandle | null>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const errorFired = useRef(false);
  const [, tick] = useState(0);

  // Expose player handle
  const userSeekedRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playerRef) return;
    playerRef.current = {
      get isPaused() {
        return video.paused;
      },
      get isLive() {
        // If user hasn't manually seeked, they're live. Period.
        // HLS pre-buffers ahead so buffered.end is always > currentTime.
        return !userSeekedRef.current;
      },
      get currentDelay() {
        if (video.buffered.length === 0) return 0;
        const bufEnd = video.buffered.end(video.buffered.length - 1);
        return Math.max(0, bufEnd - video.currentTime);
      },
      play() {
        video.play().catch(() => {});
        tick((n) => n + 1);
      },
      pause() {
        video.pause();
        tick((n) => n + 1);
      },
      goLive() {
        const hls = hlsRef.current;
        if (hls) {
          hls.startLoad(-1);
        }
        if (video.buffered.length > 0) {
          const liveEdge = video.buffered.end(video.buffered.length - 1);
          video.currentTime = liveEdge - 0.5;
        } else if (isFinite(video.duration)) {
          video.currentTime = video.duration;
        } else {
          video.currentTime = 1e10;
        }
        userSeekedRef.current = false;
        video.play().catch(() => {});
        tick((n) => n + 1);
      },
      get bufferRange(): [number, number] | null {
        // Use seekable range — this is what we can actually seek to
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
        tick((n) => n + 1);
      },
    };
    const iv = setInterval(() => tick((n) => n + 1), 1000);
    return () => {
      clearInterval(iv);
      if (playerRef) playerRef.current = null;
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

    const fireError = () => {
      if (!errorFired.current) {
        errorFired.current = true;
        onError();
      }
    };

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        maxBufferLength: 10,
        maxMaxBufferLength: 30,
        backBufferLength: DVR_BACK_BUFFER,
      });
      hls.loadSource(channel.url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        onLoaded();
        video.play().catch(() => {});
      });

      let networkRetries = 0;
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          if (
            data.type === Hls.ErrorTypes.NETWORK_ERROR &&
            networkRetries < 2
          ) {
            networkRetries++;
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            fireError();
          }
        }
      });

      const timeout = setTimeout(() => {
        if (!errorFired.current && video.readyState < 2) fireError();
      }, 15_000);

      hlsRef.current = hls;
      return () => {
        clearTimeout(timeout);
        hls.destroy();
        hlsRef.current = null;
      };
    }

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = channel.url;
      const onMeta = () => {
        onLoaded();
        video.play().catch(() => {});
      };
      video.addEventListener("loadedmetadata", onMeta);
      video.addEventListener("error", fireError);
      const timeout = setTimeout(() => {
        if (!errorFired.current && video.readyState < 2) fireError();
      }, 15_000);
      return () => {
        clearTimeout(timeout);
        video.removeEventListener("loadedmetadata", onMeta);
        video.removeEventListener("error", fireError);
        video.src = "";
      };
    }

    fireError();
  }, [channel.url]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const update = () => {
      for (let i = 0; i < vid.textTracks.length; i++) {
        const track = vid.textTracks[i];
        if (track) track.mode = ccEnabled ? "showing" : "hidden";
      }
    };
    update();
    vid.textTracks.addEventListener("addtrack", update);
    return () => vid.textTracks.removeEventListener("addtrack", update);
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

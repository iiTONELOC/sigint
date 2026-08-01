import { useState, useEffect, useRef, useCallback } from "react";
import { RefreshCw } from "lucide-react";
import { DomEvent } from "@/runtime";

enum ConnectionStatusTiming {
  ReconnectedMs = 3_000,
}

enum PullRefreshBoundaryPx {
  ActivationDistance = 30,
  MaximumDistance = 160,
  ReloadDistance = 120,
  ScrollTopMaximum = 2,
  VisibleDistance = 10,
}

enum PullRefreshScale {
  Distance = 0.4,
  FullProgress = 1,
  Opacity = 1.5,
  RotationDegrees = 360,
}

enum ConnectionStatusIconSize {
  Pull = 20,
  Retry = 10,
}

enum ConnectionStatusSelector {
  DetailSheet = "[data-detail-sheet]",
}

enum ConnectionStatusAsset {
  Probe = "/icons/icon-72x72.png",
}

enum ConnectionStatusClassName {
  PullLayer = "fixed top-0 inset-x-0 z-9998 flex items-center justify-center pointer-events-none",
  Spinning = "animate-spin",
  StatusBar = "fixed top-0 inset-x-0 z-9999 flex items-center justify-center gap-2 py-1 text-[11px] font-semibold tracking-widest transition-all duration-300",
}

/** Show connection changes and provide touch refresh. */
export function ConnectionStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [showReconnected, setShowReconnected] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const wasOffline = useRef(false);

  const [pullDistance, setPullDistance] = useState(0);
  const [pulling, setPulling] = useState(false);
  const touchStartRef = useRef<{ y: number } | null>(null);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      if (wasOffline.current) {
        setShowReconnected(true);
        setTimeout(
          () => setShowReconnected(false),
          ConnectionStatusTiming.ReconnectedMs,
        );
      }
      wasOffline.current = false;
    };
    const goOffline = () => {
      setOnline(false);
      wasOffline.current = true;
    };

    window.addEventListener(DomEvent.Online, goOnline);
    window.addEventListener(DomEvent.Offline, goOffline);
    return () => {
      window.removeEventListener(DomEvent.Online, goOnline);
      window.removeEventListener(DomEvent.Offline, goOffline);
    };
  }, []);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest(ConnectionStatusSelector.DetailSheet)) return;

      // The edge gate prevents a globe drag from starting a refresh.
      const touch = e.touches.item(0);
      if (!touch) return;
      const startY = touch.clientY;
      if (startY > PullRefreshBoundaryPx.ActivationDistance) return;

      const scrollTop =
        document.documentElement.scrollTop || document.body.scrollTop || 0;
      if (scrollTop > PullRefreshBoundaryPx.ScrollTopMaximum) return;
      touchStartRef.current = { y: startY };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current) return;
      const touch = e.touches.item(0);
      if (!touch) return;
      const dy = touch.clientY - touchStartRef.current.y;
      if (dy > PullRefreshBoundaryPx.ActivationDistance) {
        setPulling(true);
        setPullDistance(
          Math.min(
            PullRefreshBoundaryPx.MaximumDistance,
            (dy - PullRefreshBoundaryPx.ActivationDistance) *
              PullRefreshScale.Distance,
          ),
        );
      } else {
        setPulling(false);
        setPullDistance(0);
      }
    };

    const onTouchEnd = () => {
      if (
        pulling &&
        pullDistance >= PullRefreshBoundaryPx.ReloadDistance
      ) {
        if (navigator.onLine || navigator.serviceWorker?.controller) {
          window.location.reload();
        }
      }
      touchStartRef.current = null;
      setPulling(false);
      setPullDistance(0);
    };

    document.addEventListener(DomEvent.TouchStart, onTouchStart, {
      passive: true,
    });
    document.addEventListener(DomEvent.TouchMove, onTouchMove, {
      passive: true,
    });
    document.addEventListener(DomEvent.TouchEnd, onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener(DomEvent.TouchStart, onTouchStart);
      document.removeEventListener(DomEvent.TouchMove, onTouchMove);
      document.removeEventListener(DomEvent.TouchEnd, onTouchEnd);
    };
  }, [pulling, pullDistance]);

  const doRetry = useCallback(async () => {
    setRetrying(true);

    if (navigator.onLine) {
      window.location.reload();
      return;
    }

    const img = new Image();
    img.onload = () => {
      window.location.reload();
    };
    img.onerror = () => {
      setRetrying(false);
    };
    img.src = `${ConnectionStatusAsset.Probe}?_=${Date.now()}`;
  }, []);

  const pullProgress = Math.min(
    PullRefreshScale.FullProgress,
    pullDistance / PullRefreshBoundaryPx.ReloadDistance,
  );

  return (
    <>
      {pulling &&
        pullDistance > PullRefreshBoundaryPx.VisibleDistance && (
        <div
          className={ConnectionStatusClassName.PullLayer}
          style={{ height: pullDistance }}
        >
          <RefreshCw
            size={ConnectionStatusIconSize.Pull}
            className={`text-sig-accent ${
              pullProgress >= PullRefreshScale.FullProgress
                ? ConnectionStatusClassName.Spinning
                : ""
            }`}
            style={{
              transform: `rotate(${
                pullProgress * PullRefreshScale.RotationDegrees
              }deg)`,
              opacity: Math.min(
                PullRefreshScale.FullProgress,
                pullProgress * PullRefreshScale.Opacity,
              ),
            }}
          />
        </div>
      )}

      {(!online || showReconnected) && (
        <div
          className={`${ConnectionStatusClassName.StatusBar} ${
            online
              ? "bg-green-900/90 text-green-300"
              : "bg-sig-danger/90 text-white"
          }`}
        >
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              online
                ? "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]"
                : "bg-white animate-pulse"
            }`}
          />
          {online ? "RECONNECTED" : "OFFLINE: CACHED DATA ONLY"}
          {!online && (
            <button
              onClick={doRetry}
              disabled={retrying}
              className="ml-2 px-2 py-0.5 rounded border border-white/30 text-[10px] tracking-wider hover:bg-white/10 transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw
                size={ConnectionStatusIconSize.Retry}
                className={
                  retrying ? ConnectionStatusClassName.Spinning : ""
                }
              />
              {retrying ? "CHECKING" : "RETRY"}
            </button>
          )}
        </div>
      )}
    </>
  );
}

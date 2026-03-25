import { useState, useEffect, useRef, useCallback } from "react";
import { RefreshCw } from "lucide-react";

/**
 * Non-intrusive offline/online indicator + pull-to-refresh.
 *
 * - Offline: red bar + "OFFLINE — CACHED DATA ONLY" + RETRY (pings server)
 * - Reconnected: green bar + "RECONNECTED" for 3s, then auto-dismisses
 * - Pull-to-refresh: touch drag down from top reloads (only when online
 *   or SW-cached, never triggers browser dinosaur)
 *
 * Render once in AppShell — no props needed.
 */
export function ConnectionStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [showReconnected, setShowReconnected] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const wasOffline = useRef(false);

  // ── Pull-to-refresh ────────────────────────────────────────────────
  const [pullDistance, setPullDistance] = useState(0);
  const [pulling, setPulling] = useState(false);
  const touchStartRef = useRef<{ y: number } | null>(null);
  const PULL_THRESHOLD = 120;
  const PULL_DEAD_ZONE = 30; // Must drag 30px before pull starts

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      if (wasOffline.current) {
        setShowReconnected(true);
        setTimeout(() => setShowReconnected(false), 3000);
      }
      wasOffline.current = false;
    };
    const goOffline = () => {
      setOnline(false);
      wasOffline.current = true;
    };

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // ── Pull-to-refresh touch handlers ─────────────────────────────────
  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      // Ignore touches inside the detail bottom sheet — its own drag handles those
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("[data-detail-sheet]")) return;

      const scrollTop =
        document.documentElement.scrollTop || document.body.scrollTop || 0;
      if (scrollTop > 2) return;
      touchStartRef.current = { y: e.touches[0]!.clientY };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current) return;
      const dy = e.touches[0]!.clientY - touchStartRef.current.y;
      if (dy > PULL_DEAD_ZONE) {
        setPulling(true);
        setPullDistance(Math.min(160, (dy - PULL_DEAD_ZONE) * 0.4));
      } else {
        setPulling(false);
        setPullDistance(0);
      }
    };

    const onTouchEnd = () => {
      if (pulling && pullDistance >= PULL_THRESHOLD) {
        // Only reload if we're online or have a SW controller (cached page)
        if (navigator.onLine || navigator.serviceWorker?.controller) {
          window.location.reload();
        }
      }
      touchStartRef.current = null;
      setPulling(false);
      setPullDistance(0);
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [pulling, pullDistance]);

  // ── Retry: ping the server to check if we're really back ──────────
  const doRetry = useCallback(async () => {
    setRetrying(true);

    if (navigator.onLine) {
      window.location.reload();
      return;
    }

    // Probe with Image — never triggers navigation or dinosaur page
    const img = new Image();
    img.onload = () => {
      window.location.reload();
    };
    img.onerror = () => {
      setRetrying(false);
    };
    img.src = `/icons/icon-72x72.png?_=${Date.now()}`;
  }, []);

  const pullProgress = Math.min(1, pullDistance / PULL_THRESHOLD);

  return (
    <>
      {/* Pull-to-refresh spinner */}
      {pulling && pullDistance > 10 && (
        <div
          className="fixed top-0 inset-x-0 z-[9998] flex items-center justify-center pointer-events-none"
          style={{ height: pullDistance }}
        >
          <RefreshCw
            size={20}
            className={`text-sig-accent ${pullProgress >= 1 ? "animate-spin" : ""}`}
            style={{
              transform: `rotate(${pullProgress * 360}deg)`,
              opacity: Math.min(1, pullProgress * 1.5),
            }}
          />
        </div>
      )}

      {/* Offline / Reconnected bar */}
      {(!online || showReconnected) && (
        <div
          className={`fixed top-0 inset-x-0 z-[9999] flex items-center justify-center gap-2 py-1 text-[11px] font-semibold tracking-widest transition-all duration-300 ${
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
          {online ? "RECONNECTED" : "OFFLINE — CACHED DATA ONLY"}
          {!online && (
            <button
              onClick={doRetry}
              disabled={retrying}
              className="ml-2 px-2 py-0.5 rounded border border-white/30 text-[10px] tracking-wider hover:bg-white/10 transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              <RefreshCw size={10} className={retrying ? "animate-spin" : ""} />
              {retrying ? "CHECKING" : "RETRY"}
            </button>
          )}
        </div>
      )}
    </>
  );
}

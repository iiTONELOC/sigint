import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, ChevronLeft, X, Sparkles } from "lucide-react";
import { cacheSet } from "@/lib/storageService";
import { CACHE_KEYS } from "@/lib/cacheKeys";
import {
  ESSENTIAL_STEPS,
  ADVANCED_STEPS,
  type WalkthroughStep,
  type StepPlacement,
} from "@/lib/walkthroughSteps";
import {
  requestWalkthroughReset,
  requestWalkthroughUndo,
  setWalkthroughStepId,
  useWalkthroughLeafTypes,
  useWalkthroughLeafCount,
  useWalkthroughPresetCount,
  useVideoPresetCount,
} from "@/panes/paneLayoutContext";
import { useData } from "@/context/DataContext";

type WalkthroughProps = {
  readonly onComplete: () => void;
  readonly startMode?: "essential" | "advanced" | "both";
};

type Phase = "essential" | "transition" | "advanced";

type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const CUTOUT_PAD = 8;
const CUTOUT_RADIUS = 8;
const TOOLTIP_GAP = 14;
const TOOLTIP_MAX_W = 340;
const VIEWPORT_PAD = 12;

// ── Colorize data type keywords in descriptions ──────────────────────

const COLOR_KEYWORDS: [RegExp, string][] = [
  [/\baircraft\b/gi, "var(--sigint-aircraft)"],
  [/\bvessel(?:s)?\b/gi, "var(--sigint-ships)"],
  [/\bship(?:s)?\b/gi, "var(--sigint-ships)"],
  [/\bAIS\b/g, "var(--sigint-ships)"],
  [/\bseismic\b/gi, "var(--sigint-quakes)"],
  [/\bearthquake(?:s)?\b/gi, "var(--sigint-quakes)"],
  [/\bfire(?:s|\.?)\b/gi, "var(--sigint-fires)"],
  [/\bFIRMS\b/g, "var(--sigint-fires)"],
  [/\bweather\b/gi, "var(--sigint-weather)"],
  [/\bGDELT\b/g, "var(--sigint-events)"],
  [/\bevent(?:s)?\b/gi, "var(--sigint-events)"],
  [/\bNEWS FEED\b/g, "var(--sigint-accent)"],
  [/\bALERTS\b/g, "var(--sigint-danger)"],
  [/\bVIEWS\b/g, "var(--sigint-accent)"],
  [/\bsave icon\b/gi, "var(--sigint-warn)"],
  [/\bbookmark icon\b/gi, "#e040fb"],
  [/\bVIDEO FEED\b/g, "var(--sigint-warn)"],
];

function colorizeDescription(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    let earliestIdx = remaining.length;
    let matchLen = 0;
    let matchColor = "";

    for (const [re, color] of COLOR_KEYWORDS) {
      re.lastIndex = 0;
      const m = re.exec(remaining);
      if (m && m.index < earliestIdx) {
        earliestIdx = m.index;
        matchLen = m[0].length;
        matchColor = color;
      }
    }

    if (matchLen === 0) {
      parts.push(remaining);
      break;
    }

    if (earliestIdx > 0) {
      parts.push(remaining.slice(0, earliestIdx));
    }

    parts.push(
      <span key={key++} style={{ color: matchColor, fontWeight: 600 }}>
        {remaining.slice(earliestIdx, earliestIdx + matchLen)}
      </span>,
    );

    remaining = remaining.slice(earliestIdx + matchLen);
  }

  return parts;
}

function getTargetRect(selector: string): TargetRect | null {
  if (!selector) return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function computeTooltipPos(
  target: TargetRect | null,
  placement: StepPlacement,
  tooltipW: number,
  tooltipH: number,
): { x: number; y: number } {
  // Center placement — always centered on screen regardless of target
  if (placement === "center" || !target) {
    return {
      x: (window.innerWidth - tooltipW) / 2,
      y: (window.innerHeight - tooltipH) / 2,
    };
  }

  const cx = target.left + target.width / 2;
  const cy = target.top + target.height / 2;

  const positions = {
    top: {
      x: cx - tooltipW / 2,
      y: target.top - CUTOUT_PAD - TOOLTIP_GAP - tooltipH,
    },
    bottom: {
      x: cx - tooltipW / 2,
      y: target.top + target.height + CUTOUT_PAD + TOOLTIP_GAP,
    },
    left: {
      x: target.left - CUTOUT_PAD - TOOLTIP_GAP - tooltipW,
      y: cy - tooltipH / 2,
    },
    right: {
      x: target.left + target.width + CUTOUT_PAD + TOOLTIP_GAP,
      y: cy - tooltipH / 2,
    },
  } as const;

  const flip = {
    top: "bottom",
    bottom: "top",
    left: "right",
    right: "left",
  } as const;
  const p = placement as "top" | "bottom" | "left" | "right";
  const order = [p, flip[p]] as const;

  for (const dir of order) {
    const pos = positions[dir];
    const fitsX =
      pos.x >= VIEWPORT_PAD &&
      pos.x + tooltipW <= window.innerWidth - VIEWPORT_PAD;
    const fitsY =
      pos.y >= VIEWPORT_PAD &&
      pos.y + tooltipH <= window.innerHeight - VIEWPORT_PAD;
    if (fitsX && fitsY) return pos;
  }

  const pos = positions[p];
  return {
    x: Math.max(
      VIEWPORT_PAD,
      Math.min(window.innerWidth - tooltipW - VIEWPORT_PAD, pos.x),
    ),
    y: Math.max(
      VIEWPORT_PAD,
      Math.min(window.innerHeight - tooltipH - VIEWPORT_PAD, pos.y),
    ),
  };
}

// ── Highlight ring — own portal per ring ─────────────────────────────

function HighlightRing({
  selector,
  color,
}: {
  readonly selector: string;
  readonly color?: string;
}) {
  const isMagenta = color === "magenta";
  const isWarn = color === "warn";
  const isDanger = color === "danger";
  const borderColor = isMagenta
    ? "#e040fb"
    : isDanger
      ? "var(--sigint-danger, #ff4444)"
      : isWarn
        ? "#f5a623"
        : "var(--sigint-accent, #00d4f0)";
  const shadow = isMagenta
    ? "0 0 16px rgba(224,64,251,0.5), 0 0 6px rgba(224,64,251,0.3), inset 0 0 8px rgba(224,64,251,0.1)"
    : isDanger
      ? "0 0 16px rgba(255,68,68,0.5), 0 0 6px rgba(255,68,68,0.3), inset 0 0 8px rgba(255,68,68,0.1)"
      : isWarn
        ? "0 0 16px rgba(245,166,35,0.5), 0 0 6px rgba(245,166,35,0.3), inset 0 0 8px rgba(245,166,35,0.1)"
        : "0 0 16px rgba(0,212,240,0.5), 0 0 6px rgba(0,212,240,0.3), inset 0 0 8px rgba(0,212,240,0.1)";
  const [rect, setRect] = useState<TargetRect | null>(null);

  useEffect(() => {
    const tick = () => setRect(getTargetRect(selector));
    tick();
    const iv = setInterval(tick, 50);
    return () => clearInterval(iv);
  }, [selector]);

  if (!rect) return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        zIndex: 9998,
        top: rect.top - 5,
        left: rect.left - 5,
        width: rect.width + 10,
        height: rect.height + 10,
        borderRadius: 6,
        border: `2px solid ${borderColor}`,
        boxShadow: shadow,
        pointerEvents: "none",
        animation: "pulse 1.5s infinite",
      }}
    />,
    document.body,
  );
}

// ── Click indicator — pulsing dot with expanding rings ───────────────

function ClickIndicator({
  mode,
}: {
  readonly mode: "select" | "deselect" | "focus";
}) {
  const [pos, setPos] = useState<{ top: string; left: string }>({
    top: "50%",
    left: "50%",
  });

  useEffect(() => {
    const el = document.querySelector('[data-tour="globe-pane"]');
    if (!el) return;
    const r = el.getBoundingClientRect();

    if (mode === "select") {
      // The globe sphere is centered in the pane. Its radius is roughly half the min dimension.
      const globeR = Math.min(r.width, r.height) / 2;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      // North America on default rotation: roughly 20° up from center, 15° left of center
      setPos({
        top: `${cy - globeR * 0.2}px`,
        left: `${cx - globeR * 0.15}px`,
      });
    } else {
      // Outside globe on the RIGHT side — detail panel is likely on left after drag step
      setPos({
        top: `${r.top + r.height * 0.7}px`,
        left: `${r.left + r.width * 0.88}px`,
      });
    }
  }, [mode]);

  const label = mode === "select" ? "CLICK A POINT" : "CLICK EMPTY SPACE";

  const isWarn = mode === "focus";
  const dotColor = isWarn ? "#f5a623" : "var(--sigint-accent, #00d4f0)";
  const ringRgba1 = isWarn ? "rgba(245,166,35,0.3)" : "rgba(0,212,240,0.3)";
  const ringRgba2 = isWarn ? "rgba(245,166,35,0.2)" : "rgba(0,212,240,0.2)";
  const glowRgba = isWarn ? "rgba(245,166,35,0.6)" : "rgba(0,212,240,0.6)";
  const labelColor = isWarn ? "rgba(245,166,35,0.7)" : "rgba(0,212,240,0.7)";

  return createPortal(
    <div
      className="fixed z-[9998] pointer-events-none"
      style={{ ...pos, transform: "translate(-50%, -50%)" }}
    >
      <div
        className="absolute rounded-full"
        style={{
          top: "50%",
          left: "50%",
          width: 60,
          height: 60,
          marginTop: -30,
          marginLeft: -30,
          border: `1.5px solid ${ringRgba1}`,
          animation: "wt-ring 2s ease-out infinite",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          top: "50%",
          left: "50%",
          width: 60,
          height: 60,
          marginTop: -30,
          marginLeft: -30,
          border: `1.5px solid ${ringRgba2}`,
          animation: "wt-ring 2s ease-out infinite 0.6s",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          top: "50%",
          left: "50%",
          width: 10,
          height: 10,
          marginTop: -5,
          marginLeft: -5,
          backgroundColor: dotColor,
          animation: "pulse 1.5s infinite",
          boxShadow: `0 0 12px ${glowRgba}`,
        }}
      />
      <div
        className="absolute text-[10px] tracking-widest font-semibold whitespace-nowrap"
        style={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%, 24px)",
          color: labelColor,
        }}
      >
        {label}
      </div>
      <style>{`
        @keyframes wt-ring {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(3); opacity: 0; }
        }
      `}</style>
    </div>,
    document.body,
  );
}

// ── Component ────────────────────────────────────────────────────────

export function Walkthrough({
  onComplete,
  startMode = "both",
}: WalkthroughProps) {
  const [phase, setPhase] = useState<Phase>(
    startMode === "advanced" ? "advanced" : "essential",
  );
  const skipTransition = startMode !== "both";
  const [stepIdx, setStepIdx] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hasResetRef = useRef(false);
  const baselinePresetCountRef = useRef<number | null>(null);
  const prevLeafTypesRef = useRef<Set<string>>(new Set(["globe"]));

  const leafTypes = useWalkthroughLeafTypes();
  const leafCount = useWalkthroughLeafCount();
  const presetCount = useWalkthroughPresetCount();
  const { selectedCurrent, chromeHidden } = useData();
  const videoPresetCount = useVideoPresetCount();

  const steps: WalkthroughStep[] =
    phase === "essential" ? ESSENTIAL_STEPS : ADVANCED_STEPS;
  const currentStep = steps[stepIdx];
  const totalInPhase = steps.length;
  const isLastInPhase = stepIdx === totalInPhase - 1;

  // Push current step ID so LiveTrafficPane knows which step is active
  useEffect(() => {
    setWalkthroughStepId(currentStep?.id ?? null);
  }, [currentStep]);

  useEffect(() => {
    if (!hasResetRef.current) {
      hasResetRef.current = true;
      requestWalkthroughReset();
    }
  }, []);

  const baselineVideoPresetCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (!currentStep || currentStep.mode !== "action") return;
    if (!currentStep.completionCheck) return;

    if (
      currentStep.id === "save-preset" &&
      baselinePresetCountRef.current === null
    ) {
      baselinePresetCountRef.current = presetCount;
    }

    if (
      currentStep.id === "save-video-preset" &&
      baselineVideoPresetCountRef.current === null
    ) {
      baselineVideoPresetCountRef.current = videoPresetCount;
    }

    const effectivePresetCount =
      currentStep.id === "save-preset"
        ? Math.max(0, presetCount - (baselinePresetCountRef.current ?? 0))
        : presetCount;

    const effectiveVideoPresetCount =
      currentStep.id === "save-video-preset"
        ? Math.max(
            0,
            videoPresetCount - (baselineVideoPresetCountRef.current ?? 0),
          )
        : videoPresetCount;

    const selectedId = selectedCurrent?.id ?? null;

    if (
      currentStep.completionCheck(
        leafTypes,
        leafCount,
        effectivePresetCount,
        selectedId,
        chromeHidden,
        effectiveVideoPresetCount,
      )
    ) {
      const timer = setTimeout(() => {
        if (currentStep.id === "save-preset") {
          baselinePresetCountRef.current = null;
        }
        if (currentStep.id === "save-video-preset") {
          baselineVideoPresetCountRef.current = null;
        }
        prevLeafTypesRef.current = leafTypes;
        setStepIdx((i) => i + 1);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [
    currentStep,
    leafTypes,
    leafCount,
    presetCount,
    selectedCurrent,
    chromeHidden,
    videoPresetCount,
  ]);

  useEffect(() => {
    if (
      !currentStep ||
      currentStep.mode !== "action" ||
      !currentStep.expectedPaneType
    ) {
      prevLeafTypesRef.current = leafTypes;
      return;
    }

    const newTypes = [...leafTypes].filter(
      (t) => !prevLeafTypesRef.current.has(t),
    );

    for (const t of newTypes) {
      if (t !== currentStep.expectedPaneType && t !== "globe") {
        requestWalkthroughUndo(t);
      }
    }

    prevLeafTypesRef.current = leafTypes;
  }, [currentStep, leafTypes]);

  const measure = useCallback(() => {
    if (!currentStep) return;
    const rect = getTargetRect(currentStep.targetSelector);
    setTargetRect(rect);

    requestAnimationFrame(() => {
      const tt = tooltipRef.current;
      if (!tt) return;
      const ttRect = tt.getBoundingClientRect();
      const pos = computeTooltipPos(
        rect,
        currentStep.placement,
        ttRect.width,
        ttRect.height,
      );
      setTooltipPos(pos);
    });
  }, [currentStep]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const interval =
      currentStep?.mode === "action" ? setInterval(measure, 500) : null;
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      if (interval) clearInterval(interval);
    };
  }, [measure, currentStep]);

  const markComplete = useCallback(() => {
    cacheSet(CACHE_KEYS.walkthroughComplete, true);
    onComplete();
  }, [onComplete]);

  /** Session-only close — walkthrough shows again next visit */
  const handleSkip = useCallback(() => {
    onComplete();
  }, [onComplete]);

  /** Permanent dismiss — never shows again */
  const handleDismiss = useCallback(() => {
    markComplete();
  }, [markComplete]);

  const handleNext = useCallback(() => {
    if (phase === "essential" && isLastInPhase) {
      if (skipTransition) {
        markComplete();
        return;
      }
      setPhase("transition");
      return;
    }
    if (phase === "advanced" && isLastInPhase) {
      markComplete();
      return;
    }
    setStepIdx((i) => i + 1);
  }, [phase, isLastInPhase, markComplete, skipTransition]);

  const handleBack = useCallback(() => {
    if (stepIdx > 0) setStepIdx((i) => i - 1);
  }, [stepIdx]);

  const handleAcceptAdvanced = useCallback(() => {
    setPhase("advanced");
    setStepIdx(0);
  }, []);

  const handleDeclineAdvanced = useCallback(() => {
    markComplete();
  }, [markComplete]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleSkip();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [handleSkip]);

  // ── Transition prompt ──────────────────────────────────────────

  if (phase === "transition") {
    return createPortal(
      <div className="fixed inset-0 z-[9997] flex items-center justify-center">
        <svg className="absolute inset-0 w-full h-full">
          <rect width="100%" height="100%" fill="rgba(0,0,0,0.72)" />
        </svg>

        <div className="relative bg-sig-panel border border-sig-border rounded-lg shadow-2xl max-w-sm mx-4 p-6 text-center">
          <Sparkles
            size={28}
            className="text-sig-accent mx-auto mb-3"
            strokeWidth={1.5}
          />
          <div className="text-sig-bright text-sm font-semibold tracking-wider mb-2">
            NICE WORK
          </div>
          <div className="text-sig-text text-sm leading-relaxed mb-5">
            You've covered the essentials and built your first layout. Want to
            explore advanced features like watch mode, aircraft filters, and
            globe controls?
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleDeclineAdvanced}
              className="px-4 py-2 rounded text-xs font-semibold tracking-wider text-sig-dim border border-sig-border/60 hover:text-sig-text hover:border-sig-border transition-colors"
            >
              NO, I'M DONE
            </button>
            <button
              onClick={handleAcceptAdvanced}
              className="px-4 py-2 rounded text-xs font-semibold tracking-wider text-sig-bg bg-sig-accent hover:bg-sig-accent/90 transition-colors"
            >
              YES, SHOW ME
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  // ── Step overlay ───────────────────────────────────────────────

  if (!currentStep) return null;

  const cutout = targetRect
    ? {
        x: targetRect.left - CUTOUT_PAD,
        y: targetRect.top - CUTOUT_PAD,
        w: targetRect.width + CUTOUT_PAD * 2,
        h: targetRect.height + CUTOUT_PAD * 2,
        rx: CUTOUT_RADIUS,
      }
    : null;

  const isAction = currentStep.mode === "action";
  const isCentered = currentStep.placement === "center";
  const showBackdrop = !isAction && !isCentered && cutout;
  const nextLabel = phase === "advanced" && isLastInPhase ? "FINISH" : "NEXT";

  // Determine which selectors get highlight rings
  // Show rings for any step that specifies them (action or info)
  const primaryRingSelector = currentStep.buttonSelector || null;
  const secondaryRingSelector = currentStep.highlightSelector || null;
  const tertiaryRingSelector = currentStep.tertiarySelector || null;
  const quaternaryRingSelector = currentStep.quaternarySelector || null;

  const showClickIndicator =
    currentStep.id === "globe-select" ||
    currentStep.id === "focus-enter" ||
    currentStep.id === "focus-exit" ||
    currentStep.id === "globe-deselect";

  const clickMode: "select" | "deselect" | "focus" =
    currentStep.id === "globe-select"
      ? "select"
      : currentStep.id === "focus-enter" || currentStep.id === "focus-exit"
        ? "focus"
        : "deselect";

  return (
    <>
      {showClickIndicator && <ClickIndicator mode={clickMode} />}
      {primaryRingSelector && (
        <HighlightRing
          key={`p-${currentStep?.id}`}
          selector={primaryRingSelector}
          color={currentStep.buttonColor}
        />
      )}
      {secondaryRingSelector && (
        <HighlightRing
          key={`s-${currentStep?.id}`}
          selector={secondaryRingSelector}
          color={currentStep.highlightColor ?? "warn"}
        />
      )}
      {tertiaryRingSelector && (
        <HighlightRing
          key={`t-${currentStep?.id}`}
          selector={tertiaryRingSelector}
          color={currentStep.buttonColor ?? "warn"}
        />
      )}
      {quaternaryRingSelector && (
        <HighlightRing
          key={`q-${currentStep?.id}`}
          selector={quaternaryRingSelector}
          color="magenta"
        />
      )}

      {createPortal(
        <div
          className="fixed inset-0 z-[9997]"
          style={{ pointerEvents: "none" }}
        >
          {showBackdrop && (
            <svg
              className="absolute inset-0 w-full h-full"
              style={{ pointerEvents: "none" }}
            >
              <defs>
                <mask id="walkthrough-mask">
                  <rect width="100%" height="100%" fill="white" />
                  {cutout && (
                    <rect
                      x={cutout.x}
                      y={cutout.y}
                      width={cutout.w}
                      height={cutout.h}
                      rx={cutout.rx}
                      fill="black"
                    />
                  )}
                </mask>
              </defs>
              <rect
                width="100%"
                height="100%"
                fill="rgba(0,0,0,0.72)"
                mask="url(#walkthrough-mask)"
              />
            </svg>
          )}

          {showBackdrop && cutout && (
            <div
              className="absolute border-2 border-sig-accent/60 rounded-lg pointer-events-none"
              style={{
                top: cutout.y,
                left: cutout.x,
                width: cutout.w,
                height: cutout.h,
                boxShadow:
                  "0 0 0 4px rgba(0,212,240,0.12), 0 0 20px rgba(0,212,240,0.08)",
              }}
            />
          )}

          <div
            ref={tooltipRef}
            className="absolute"
            style={{
              left: tooltipPos?.x ?? -9999,
              top: tooltipPos?.y ?? -9999,
              opacity: tooltipPos ? 1 : 0,
              maxWidth: TOOLTIP_MAX_W,
              pointerEvents: "auto",
              transition:
                "opacity 0.2s ease-out, left 0.25s ease-out, top 0.25s ease-out",
            }}
          >
            <div className="bg-sig-panel border border-sig-border/80 rounded-lg shadow-2xl overflow-hidden">
              <div
                className={`h-0.5 ${isAction ? "bg-sig-warn" : "bg-sig-accent"}`}
              />

              <div className="px-4 pt-3 pb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-sig-dim tracking-widest font-semibold">
                    {stepIdx + 1} / {totalInPhase}
                  </span>
                  <span className="text-[10px] tracking-wider uppercase">
                    {isAction ? (
                      <span className="text-sig-warn">DO THIS</span>
                    ) : (
                      <span className="text-sig-dim/60">
                        {phase === "essential" ? "essentials" : "advanced"}
                      </span>
                    )}
                  </span>
                </div>

                <div className="text-sm font-semibold text-sig-bright tracking-wider mb-1.5">
                  {currentStep.title}
                </div>

                <div className="text-sm text-sig-text leading-relaxed mb-4">
                  {colorizeDescription(currentStep.description)}
                </div>

                <div className="flex items-center gap-1 mb-4">
                  {Array.from({ length: totalInPhase }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-1 rounded-full transition-all ${
                        i === stepIdx
                          ? isAction
                            ? "w-4 bg-sig-warn"
                            : "w-4 bg-sig-accent"
                          : i < stepIdx
                            ? "w-1.5 bg-sig-accent/40"
                            : "w-1.5 bg-sig-border"
                      }`}
                    />
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSkip}
                    className="px-2 py-1.5 rounded text-[11px] font-semibold tracking-wider text-sig-dim hover:text-sig-text transition-colors flex items-center gap-1"
                  >
                    <X size={11} strokeWidth={2.5} />
                    SKIP
                  </button>

                  <button
                    onClick={handleDismiss}
                    className="px-2 py-1.5 rounded text-[10px] tracking-wider text-sig-dim/50 hover:text-sig-dim transition-colors"
                  >
                    DON'T SHOW AGAIN
                  </button>

                  <div className="flex-1" />

                  {stepIdx > 0 && !isAction && (
                    <button
                      onClick={handleBack}
                      className="px-2.5 py-1.5 rounded text-[11px] font-semibold tracking-wider text-sig-dim border border-sig-border/50 hover:text-sig-text hover:border-sig-border transition-colors flex items-center gap-1"
                    >
                      <ChevronLeft size={12} strokeWidth={2.5} />
                      BACK
                    </button>
                  )}

                  {!isAction && (
                    <button
                      onClick={handleNext}
                      className="px-3 py-1.5 rounded text-[11px] font-semibold tracking-wider text-sig-bg bg-sig-accent hover:bg-sig-accent/90 transition-colors flex items-center gap-1"
                    >
                      {nextLabel}
                      <ChevronRight size={12} strokeWidth={2.5} />
                    </button>
                  )}

                  {isAction && (
                    <span className="text-[10px] text-sig-warn/70 tracking-wider animate-pulse">
                      WAITING FOR ACTION...
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

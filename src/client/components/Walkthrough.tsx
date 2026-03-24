import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  ChevronRight,
  ChevronLeft,
  X,
  Sparkles,
  GripHorizontal,
} from "lucide-react";
import { cacheSet } from "@/lib/storageService";
import { CACHE_KEYS } from "@/lib/cacheKeys";
import {
  ESSENTIAL_STEPS,
  ADVANCED_STEPS,
  MOBILE_ESSENTIAL_STEPS,
  MOBILE_ADVANCED_STEPS,
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
import { useIsMobileLayout } from "@/context/LayoutModeContext";

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
const TOOLTIP_MAX_W_MOBILE = 280;
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
  [/\bINTEL FEED\b/g, "var(--sigint-accent)"],
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
  const all = document.querySelectorAll(selector);
  let el: Element | null = null;
  //@ts-ignore
  for (const candidate of all) {
    const r = candidate.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      el = candidate;
      break;
    }
  }
  if (!el) el = all[0] ?? null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function computeTooltipPos(
  target: TargetRect | null,
  placement: StepPlacement,
  tooltipW: number,
  tooltipH: number,
  stepId?: string,
  stepSelectors?: string[],
): { x: number; y: number } {
  const vv = window.visualViewport;
  const vw = vv?.width ?? window.innerWidth;
  const vh = vv?.height ?? window.innerHeight;
  const vvTop = vv?.offsetTop ?? 0;
  const pad = VIEWPORT_PAD;
  const cx = (vw - tooltipW) / 2;

  // ── Collect all obstacles from the step's highlighted selectors ──
  const obstacles: DOMRect[] = [];

  // Resolve actual target elements from step selectors (buttonSelector, highlightSelector, etc.)
  if (stepSelectors) {
    for (const sel of stepSelectors) {
      if (!sel) continue;
      const rect = getTargetRect(sel);
      if (rect && rect.width > 0) {
        obstacles.push(
          new DOMRect(
            rect.left - 10,
            rect.top - 10,
            rect.width + 20,
            rect.height + 20,
          ),
        );
      }
    }
  }

  // Any open split/type menus
  const menus = document.querySelectorAll("[data-wt-menu]");
  //@ts-ignore
  for (const menu of menus) {
    const r = (menu as HTMLElement).getBoundingClientRect();
    if (r.width > 0 && r.height > 0) obstacles.push(r);
  }

  // Click indicator
  const indicator = document.querySelector("[data-wt-indicator]");
  if (indicator) {
    const r = (indicator as HTMLElement).getBoundingClientRect();
    if (r.width > 0 && r.height > 0) obstacles.push(r);
  }

  // Target element itself (cutout area)
  if (target && target.width > 0) {
    obstacles.push(
      new DOMRect(
        target.left - CUTOUT_PAD,
        target.top - CUTOUT_PAD,
        target.width + CUTOUT_PAD * 2,
        target.height + CUTOUT_PAD * 2,
      ),
    );
  }

  // ── Overlap check ──
  const overlaps = (x: number, y: number) => {
    for (const ob of obstacles) {
      if (
        x + tooltipW > ob.left &&
        x < ob.right &&
        y + tooltipH > ob.top &&
        y < ob.bottom
      )
        return true;
    }
    return false;
  };

  // ── Candidate positions (visual viewport aware) ──
  const candidates: { x: number; y: number }[] = [];

  // Position directly above or below each obstacle (most important)
  for (const ob of obstacles) {
    // Above the obstacle
    candidates.push({ x: cx, y: ob.top - tooltipH - 8 });
    // Below the obstacle
    candidates.push({ x: cx, y: ob.bottom + 8 });
  }

  // Standard positions
  candidates.push(
    { x: cx, y: vvTop + pad },
    { x: cx, y: vvTop + vh - tooltipH - pad },
    { x: cx, y: vvTop + (vh - tooltipH) / 2 },
    { x: pad, y: vvTop + pad },
    { x: vw - tooltipW - pad, y: vvTop + pad },
    { x: pad, y: vvTop + vh - tooltipH - pad },
    { x: vw - tooltipW - pad, y: vvTop + vh - tooltipH - pad },
  );

  // For directional placement, prioritize the requested direction
  if (placement !== "center" && target) {
    const tcx = target.left + target.width / 2;
    const tcy = target.top + target.height / 2;
    candidates.unshift(
      {
        x: tcx - tooltipW / 2,
        y: target.top - CUTOUT_PAD - TOOLTIP_GAP - tooltipH,
      },
      {
        x: tcx - tooltipW / 2,
        y: target.top + target.height + CUTOUT_PAD + TOOLTIP_GAP,
      },
      {
        x: target.left + target.width + CUTOUT_PAD + TOOLTIP_GAP,
        y: tcy - tooltipH / 2,
      },
      {
        x: target.left - CUTOUT_PAD - TOOLTIP_GAP - tooltipW,
        y: tcy - tooltipH / 2,
      },
    );
  }

  // Globe action steps — prefer top
  const globeActionSteps = new Set([
    "globe-select",
    "globe-deselect",
    "mobile-detail-sheet",
  ]);
  if (stepId && globeActionSteps.has(stepId)) {
    candidates.unshift({ x: cx, y: vvTop + pad });
  }

  // Find first candidate that doesn't overlap any obstacle
  for (const c of candidates) {
    const clampedX = Math.max(pad, Math.min(vw - tooltipW - pad, c.x));
    const clampedY = Math.max(
      vvTop + pad,
      Math.min(vvTop + vh - tooltipH - pad, c.y),
    );
    if (!overlaps(clampedX, clampedY)) {
      return { x: clampedX, y: clampedY };
    }
  }

  // Absolute fallback — top of visible viewport
  return { x: Math.max(pad, cx), y: vvTop + pad };
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

  const ringRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    let mounted = true;
    const track = () => {
      if (!mounted) return;
      const rect = getTargetRect(selector);
      const el = ringRef.current;
      if (el && rect && rect.width > 0) {
        // Use scroll offsets for absolute positioning (fixes iOS keyboard shift)
        const sx = window.scrollX;
        const sy = window.scrollY;
        el.style.top = `${rect.top + sy - 5}px`;
        el.style.left = `${rect.left + sx - 5}px`;
        el.style.width = `${rect.width + 10}px`;
        el.style.height = `${rect.height + 10}px`;
        el.style.display = "block";
      } else if (el) {
        el.style.display = "none";
      }
      rafRef.current = requestAnimationFrame(track);
    };
    rafRef.current = requestAnimationFrame(track);
    return () => {
      mounted = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [selector]);

  return createPortal(
    <div
      ref={ringRef}
      data-wt-ring=""
      style={{
        position: "absolute",
        zIndex: 9998,
        borderRadius: 6,
        border: `2px solid ${borderColor}`,
        boxShadow: shadow,
        pointerEvents: "none",
        animation: "pulse 1.5s infinite",
        display: "none",
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

  const recalc = useCallback(() => {
    const canvas = document.querySelector('[data-tour="globe-pane"] canvas');
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    // Globe rendering: center = canvas center, radius = min(W,H) * 0.4 at zoom 1
    // (from projection.ts: projGlobe uses Math.min(W, H) * 0.4 * zoomGlobe)
    const W = r.width;
    const H = r.height;
    const globeR = Math.min(W, H) * 0.4; // default zoom = 1
    const cx = r.left + W / 2;
    const cy = r.top + H / 2;

    if (mode === "select") {
      // Over North America — Texas/Oklahoma area
      setPos({
        top: `${cy - globeR * 0.25}px`,
        left: `${cx - globeR * 0.22}px`,
      });
    } else {
      // Runtime collision check — find empty space avoiding globe, panel, and tooltip
      const canvas = document.querySelector('[data-tour="globe-pane"] canvas');
      if (!canvas) return;
      const cr = canvas.getBoundingClientRect();

      // Collect all obstacle rects
      const obstacles: DOMRect[] = [];

      // Globe sphere as a rect
      const sphereRect = new DOMRect(
        cx - globeR,
        cy - globeR,
        globeR * 2,
        globeR * 2,
      );
      obstacles.push(sphereRect);

      // Detail panel
      const panel = document
        .querySelector('[data-tour="detail-drag-handle"]')
        ?.closest("div.absolute, div.fixed");
      if (panel) obstacles.push(panel.getBoundingClientRect());

      // Walkthrough tooltip
      const tooltip = document.querySelector(".cursor-grab");
      if (tooltip) obstacles.push(tooltip.getBoundingClientRect());

      // Indicator is ~80x50 including rings and label
      const IW = 100;
      const IH = 80;

      // Candidate positions — corners and midpoints of canvas dark areas
      const candidates = [
        { x: cr.left + 60, y: cr.top + cr.height - 80 }, // bottom-left
        { x: cr.left + cr.width - 60, y: cr.top + cr.height - 80 }, // bottom-right
        { x: cr.left + 60, y: cr.top + 60 }, // top-left
        { x: cr.left + cr.width - 60, y: cr.top + 60 }, // top-right
        { x: cr.left + 60, y: cy }, // mid-left
        { x: cr.left + cr.width - 60, y: cy }, // mid-right
        { x: cx, y: cr.top + cr.height - 60 }, // bottom-center
        { x: cx, y: cr.top + 60 }, // top-center
      ];

      const overlaps = (px: number, py: number) => {
        for (const ob of obstacles) {
          if (
            px + IW / 2 > ob.left &&
            px - IW / 2 < ob.right &&
            py + IH / 2 > ob.top &&
            py - IH / 2 < ob.bottom
          )
            return true;
        }
        return false;
      };

      // Pick the first candidate that doesn't overlap anything
      let best = candidates[0]!;
      for (const c of candidates) {
        if (!overlaps(c.x, c.y)) {
          best = c;
          break;
        }
      }

      setPos({ top: `${best.y}px`, left: `${best.x}px` });
    }
  }, [mode]);

  useEffect(() => {
    recalc();
    window.addEventListener("resize", recalc);
    return () => {
      window.removeEventListener("resize", recalc);
    };
  }, [recalc, mode]);

  const label = mode === "select" ? "CLICK A POINT" : "CLICK EMPTY SPACE";

  const isWarn = mode === "focus";
  const dotColor = isWarn ? "#f5a623" : "#00d4f0";
  const ringRgba1 = isWarn ? "rgba(245,166,35,0.6)" : "rgba(0,212,240,0.6)";
  const ringRgba2 = isWarn ? "rgba(245,166,35,0.4)" : "rgba(0,212,240,0.4)";
  const glowRgba = isWarn ? "rgba(245,166,35,0.9)" : "rgba(0,212,240,0.9)";
  const labelColor = isWarn ? "#f5a623" : "#00d4f0";

  return createPortal(
    <div
      className="fixed z-[9996] pointer-events-none"
      data-wt-indicator=""
      style={{ ...pos, transform: "translate(-50%, -50%)" }}
    >
      <div
        className="absolute rounded-full"
        style={{
          top: "50%",
          left: "50%",
          width: 80,
          height: 80,
          marginTop: -40,
          marginLeft: -40,
          border: `2px solid ${ringRgba1}`,
          animation: "wt-ring 2s ease-out infinite",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          top: "50%",
          left: "50%",
          width: 80,
          height: 80,
          marginTop: -40,
          marginLeft: -40,
          border: `2px solid ${ringRgba2}`,
          animation: "wt-ring 2s ease-out infinite 0.6s",
        }}
      />
      <div
        className="absolute rounded-full"
        style={{
          top: "50%",
          left: "50%",
          width: 14,
          height: 14,
          marginTop: -7,
          marginLeft: -7,
          backgroundColor: dotColor,
          animation: "pulse 1.5s infinite",
          boxShadow: `0 0 20px ${glowRgba}, 0 0 40px ${glowRgba}`,
        }}
      />
      <div
        className="absolute text-[11px] tracking-widest font-bold whitespace-nowrap"
        style={{
          top: "50%",
          left: "50%",
          transform: "translate(-50%, 30px)",
          color: labelColor,
          textShadow: `0 0 8px ${glowRgba}`,
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

// ── Landing zone — shows where to drag the detail panel ──────────────

function LandingZone({ onDrop }: { readonly onDrop: () => void }) {
  const [rect, setRect] = useState<{
    top: number;
    left: number;
    width: number;
    height: number;
  } | null>(null);
  const [dropped, setDropped] = useState(false);

  useEffect(() => {
    const calc = () => {
      const canvas = document.querySelector('[data-tour="globe-pane"] canvas');
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      setRect({
        top: r.top + 40,
        left: r.left + 12,
        width: r.width * 0.28,
        height: r.height * 0.55,
      });
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  // Detect drop — only check position after pointer is released
  useEffect(() => {
    if (dropped || !rect) return;
    let dragging = false;
    const onDown = () => {
      dragging = true;
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      // Check position after release
      setTimeout(() => {
        const handle = document.querySelector(
          '[data-tour="detail-drag-handle"]',
        );
        if (!handle) return;
        const hr = handle.getBoundingClientRect();
        const hcx = hr.left + hr.width / 2;
        if (hcx >= rect.left && hcx <= rect.left + rect.width) {
          setDropped(true);
          setTimeout(() => onDrop(), 600);
        }
      }, 50);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("pointerup", onUp);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerup", onUp);
    };
  }, [rect, dropped, onDrop]);

  if (!rect || dropped) return null;

  return createPortal(
    <div
      className="fixed z-[9996] pointer-events-none"
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        border: "2px dashed rgba(0,212,240,0.3)",
        borderRadius: 8,
        background: "rgba(0,212,240,0.03)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        animation: "pulse 2s infinite",
      }}
    >
      <span
        className="text-[10px] tracking-widest font-bold"
        style={{ color: "rgba(0,212,240,0.5)" }}
      >
        DROP HERE
      </span>
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

  // Draggable tooltip — window listeners for touch support
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(
    null,
  );
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      setDragOffset({
        x: dragRef.current.origX + (e.clientX - dragRef.current.startX),
        y: dragRef.current.origY + (e.clientY - dragRef.current.startY),
      });
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  const onTooltipPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest("button")) return;
      if (!tooltipPos) return;
      e.preventDefault();
      const cur = dragOffset ?? { x: 0, y: 0 };
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: cur.x,
        origY: cur.y,
      };
    },
    [tooltipPos, dragOffset],
  );

  // Reset drag offset on step change
  useEffect(() => {
    setDragOffset(null);
  }, [stepIdx, phase]);

  const leafTypes = useWalkthroughLeafTypes();
  const leafCount = useWalkthroughLeafCount();
  const presetCount = useWalkthroughPresetCount();
  const { selectedCurrent, chromeHidden, setSelected } = useData();
  const videoPresetCount = useVideoPresetCount();
  const isMobile = useIsMobileLayout();

  const essentialSteps = isMobile ? MOBILE_ESSENTIAL_STEPS : ESSENTIAL_STEPS;
  const advancedSteps = isMobile ? MOBILE_ADVANCED_STEPS : ADVANCED_STEPS;

  const steps: WalkthroughStep[] =
    phase === "essential" ? essentialSteps : advancedSteps;
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
        currentStep.id,
        [
          currentStep.buttonSelector,
          currentStep.highlightSelector,
          currentStep.tertiarySelector,
          currentStep.quaternarySelector,
        ].filter(Boolean) as string[],
      );
      setTooltipPos(pos);
    });
  }, [currentStep]);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", measure);
      vv.addEventListener("scroll", measure);
    }
    // Re-measure when DOM changes (menus opening, preset lists changing)
    const mo = new MutationObserver(() => measure());
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      if (vv) {
        vv.removeEventListener("resize", measure);
        vv.removeEventListener("scroll", measure);
      }
      mo.disconnect();
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
      if (skipTransition || isMobile) {
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
  }, [phase, isLastInPhase, markComplete, skipTransition, isMobile]);

  const handleBack = useCallback(() => {
    if (stepIdx <= 0) return;
    const prevStep = steps[stepIdx - 1];
    // Going back to globe-select: deselect so completionCheck resets
    if (prevStep?.id === "globe-select") {
      setSelected(null);
    }
    setStepIdx((i) => i - 1);
  }, [stepIdx, steps, setSelected]);

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
      <div className="fixed inset-0 z-[9999] flex items-center justify-center">
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
  const nextLabel =
    (phase === "advanced" && isLastInPhase) || (isMobile && isLastInPhase)
      ? "FINISH"
      : "NEXT";

  // Determine which selectors get highlight rings
  // Show rings for any step that specifies them (action or info)
  const primaryRingSelector = currentStep.buttonSelector || null;
  const secondaryRingSelector = currentStep.highlightSelector || null;
  const tertiaryRingSelector = currentStep.tertiarySelector || null;
  const quaternaryRingSelector = currentStep.quaternarySelector || null;

  const selectedId = selectedCurrent?.id ?? null;
  const showClickIndicator =
    (currentStep.id === "globe-select" && selectedId === null) ||
    (currentStep.id === "globe-deselect" && selectedId !== null) ||
    (currentStep.id === "focus-enter" && !chromeHidden) ||
    (currentStep.id === "focus-exit" && chromeHidden);

  const clickMode: "select" | "deselect" | "focus" =
    currentStep.id === "globe-select"
      ? "select"
      : currentStep.id === "focus-enter" || currentStep.id === "focus-exit"
        ? "focus"
        : "deselect";

  const effectiveMaxW = isMobile ? TOOLTIP_MAX_W_MOBILE : TOOLTIP_MAX_W;

  return (
    <>
      {showClickIndicator && <ClickIndicator mode={clickMode} />}
      {currentStep.id === "globe-drag-detail" && (
        <LandingZone onDrop={() => setStepIdx((i) => i + 1)} />
      )}
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
          className="fixed inset-0 z-[9999]"
          style={{ pointerEvents: "none", overscrollBehavior: "contain" }}
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
            className="absolute cursor-grab active:cursor-grabbing"
            onPointerDown={onTooltipPointerDown}
            style={{
              touchAction: "none",
              overscrollBehavior: "none",
              left: (tooltipPos?.x ?? -9999) + (dragOffset?.x ?? 0),
              top: (tooltipPos?.y ?? -9999) + (dragOffset?.y ?? 0),
              opacity: tooltipPos ? 1 : 0,
              maxWidth:
                isMobile && isAction
                  ? window.innerWidth - VIEWPORT_PAD * 2
                  : effectiveMaxW,
              pointerEvents: "auto",
              transition: dragRef.current
                ? "opacity 0.2s ease-out"
                : "opacity 0.2s ease-out, left 0.25s ease-out, top 0.25s ease-out",
            }}
          >
            {/* ── Mobile action: compact single-line bar ── */}
            {isMobile && isAction ? (
              <div className="bg-sig-panel border border-sig-accent/60 rounded-lg shadow-2xl overflow-hidden">
                <div className="h-0.5 bg-sig-warn" />
                <div className="px-3 py-2 flex items-center gap-2">
                  <span className="text-[10px] text-sig-dim tracking-widest font-semibold shrink-0">
                    {stepIdx + 1}/{totalInPhase}
                  </span>
                  <span className="text-[11px] font-semibold text-sig-bright tracking-wider truncate">
                    {currentStep.title}
                  </span>
                  <span className="text-[9px] text-sig-warn/70 tracking-wider animate-pulse shrink-0 ml-auto">
                    DO THIS
                  </span>
                  <button
                    onClick={handleSkip}
                    className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wider text-sig-dim hover:text-sig-text transition-colors flex items-center gap-0.5"
                  >
                    <X size={10} strokeWidth={2.5} />
                    SKIP
                  </button>
                </div>
              </div>
            ) : (
              /* ── Full tooltip (info steps + desktop) ── */
              <div className="bg-sig-panel border border-sig-border/80 rounded-lg shadow-2xl overflow-hidden">
                <div
                  className={`h-0.5 ${isAction ? "bg-sig-warn" : "bg-sig-accent"}`}
                />
                {/* Drag handle */}
                <div className="flex justify-center py-1 text-sig-dim/30 cursor-grab active:cursor-grabbing">
                  <GripHorizontal size={14} />
                </div>

                <div className="px-4 pt-0 pb-4">
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

                  <div className="flex items-center gap-2 flex-wrap">
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

                    <div className="flex-1 basis-full sm:basis-0" />

                    {stepIdx > 0 && (
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
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

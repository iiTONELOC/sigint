import type {
  PointerEvent as ReactPointerEvent,
  ReactNode,
  RefObject,
} from "react";
import { ChevronLeft, ChevronRight, GripHorizontal, X } from "lucide-react";
import { ButtonType } from "@/lib/ui/button";
import {
  WalkthroughPhase,
  WalkthroughStepMode,
  type WalkthroughStep,
} from "../model";
import { WalkthroughStyleSlot } from "../utils";

type KeywordRule = Readonly<{
  className: WalkthroughKeywordClassName;
  pattern: RegExp;
}>;

enum WalkthroughKeywordClassName {
  Accent = "text-sig-accent",
  Aircraft = "text-sig-aircraft",
  Danger = "text-sig-danger",
  Events = "text-sig-events",
  Fires = "text-sig-fires",
  Quakes = "text-sig-quakes",
  Ships = "text-sig-ships",
  Warning = "text-sig-warn",
  Weather = "text-sig-weather",
}

const KEYWORD_RULES: readonly KeywordRule[] = [
  { pattern: /\baircraft\b/gi, className: WalkthroughKeywordClassName.Aircraft },
  { pattern: /\b(?:vessels?|ships?)\b/gi, className: WalkthroughKeywordClassName.Ships },
  { pattern: /\bAIS\b/g, className: WalkthroughKeywordClassName.Ships },
  { pattern: /\b(?:seismic|earthquakes?)\b/gi, className: WalkthroughKeywordClassName.Quakes },
  { pattern: /\bfire(?:s|\.?)\b/gi, className: WalkthroughKeywordClassName.Fires },
  { pattern: /\bFIRMS\b/g, className: WalkthroughKeywordClassName.Fires },
  { pattern: /\bweather\b/gi, className: WalkthroughKeywordClassName.Weather },
  { pattern: /\bGDELT\b/g, className: WalkthroughKeywordClassName.Events },
  { pattern: /\bevents?\b/gi, className: WalkthroughKeywordClassName.Events },
  { pattern: /\b(?:NEWS FEED|VIEWS|INTEL FEED)\b/g, className: WalkthroughKeywordClassName.Accent },
  { pattern: /\bALERTS\b/g, className: WalkthroughKeywordClassName.Danger },
  { pattern: /\b(?:save icon|VIDEO FEED)\b/gi, className: WalkthroughKeywordClassName.Warning },
  { pattern: /\bbookmark icon\b/gi, className: WalkthroughKeywordClassName.Events },
];

function colorizedDescription(text: string): ReactNode {
  const parts: ReactNode[] = [];
  let remaining = text;
  let key = 0;
  while (remaining) {
    let earliest: { rule: KeywordRule; index: number; text: string } | null = null;
    for (const rule of KEYWORD_RULES) {
      rule.pattern.lastIndex = 0;
      const match = rule.pattern.exec(remaining);
      if (match && (!earliest || match.index < earliest.index)) {
        earliest = { rule, index: match.index, text: match[0] };
      }
    }
    if (!earliest) {
      parts.push(remaining);
      break;
    }
    if (earliest.index > 0) parts.push(remaining.slice(0, earliest.index));
    parts.push(
      <span key={key++} className={`${earliest.rule.className} font-semibold`}>
        {earliest.text}
      </span>,
    );
    remaining = remaining.slice(earliest.index + earliest.text.length);
  }
  return parts;
}

type WalkthroughTooltipProps = Readonly<{
  dragging: boolean;
  isMobile: boolean;
  onBack: () => void;
  onDismiss: () => void;
  onNext: () => void;
  onPointerDown: (event: ReactPointerEvent) => void;
  onSkip: () => void;
  phase: WalkthroughPhase;
  ready: boolean;
  step: WalkthroughStep;
  stepIndex: number;
  tooltipRef: RefObject<HTMLDivElement | null>;
  totalSteps: number;
}>;

enum WalkthroughTooltipIconMetric {
  BackSize = 12,
  CloseSize = 11,
  DragSize = 14,
  MobileCloseSize = 10,
  StrokeWidth = 2.5,
}

enum WalkthroughProgressClassName {
  Complete = "w-1.5 bg-sig-accent/40",
  CurrentAction = "w-4 bg-sig-warn",
  CurrentInformation = "w-4 bg-sig-accent",
  Pending = "w-1.5 bg-sig-border",
}

function progressClassName(
  index: number,
  stepIndex: number,
  action: boolean,
): WalkthroughProgressClassName {
  if (index < stepIndex) return WalkthroughProgressClassName.Complete;
  if (index > stepIndex) return WalkthroughProgressClassName.Pending;
  return action
    ? WalkthroughProgressClassName.CurrentAction
    : WalkthroughProgressClassName.CurrentInformation;
}

function MobileActionTooltip({
  onSkip,
  step,
  stepIndex,
  totalSteps,
}: Readonly<{
  onSkip: () => void;
  step: WalkthroughStep;
  stepIndex: number;
  totalSteps: number;
}>) {
  return (
    <div className="bg-sig-panel border border-sig-accent/60 rounded-lg shadow-2xl overflow-hidden">
      <div className="h-0.5 bg-sig-warn" />
      <div className="px-3 py-2 flex items-center gap-2">
        <span className="text-[10px] text-sig-dim tracking-widest font-semibold shrink-0">
          {stepIndex + 1}/{totalSteps}
        </span>
        <span className="text-[11px] font-semibold text-sig-bright tracking-wider truncate">
          {step.title}
        </span>
        <span className="text-[9px] text-sig-warn/70 tracking-wider animate-pulse shrink-0 ml-auto">
          DO THIS
        </span>
        <button
          type={ButtonType.Button}
          onClick={onSkip}
          className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wider text-sig-dim hover:text-sig-text transition-colors flex items-center gap-0.5"
        >
          <X
            size={WalkthroughTooltipIconMetric.MobileCloseSize}
            strokeWidth={WalkthroughTooltipIconMetric.StrokeWidth}
          />
          SKIP
        </button>
      </div>
    </div>
  );
}

function StepProgress({
  action,
  stepIndex,
  totalSteps,
}: Readonly<{
  action: boolean;
  stepIndex: number;
  totalSteps: number;
}>) {
  return (
    <div
      role="progressbar"
      aria-label="Walkthrough progress"
      aria-valuemin={1}
      aria-valuemax={totalSteps}
      aria-valuenow={stepIndex + 1}
      className="flex items-center gap-1 mb-4"
    >
      {Array.from({ length: totalSteps }).map((_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className={`h-1 rounded-full transition-all ${progressClassName(index, stepIndex, action)}`}
        />
      ))}
    </div>
  );
}

function FullTooltip({
  isMobile,
  onBack,
  onDismiss,
  onNext,
  onSkip,
  phase,
  step,
  stepIndex,
  totalSteps,
}: Omit<
  WalkthroughTooltipProps,
  | "dragging"
  | "onPointerDown"
  | "ready"
  | "tooltipRef"
>) {
  const action = step.mode === WalkthroughStepMode.Action;
  const lastStep = stepIndex === totalSteps - 1;
  const nextLabel =
    (phase === WalkthroughPhase.Advanced && lastStep) ||
    (isMobile && lastStep)
      ? "FINISH"
      : "NEXT";

  return (
    <div className="bg-sig-panel border border-sig-border/80 rounded-lg shadow-2xl overflow-hidden">
      <div className={`h-0.5 ${action ? "bg-sig-warn" : "bg-sig-accent"}`} />
      <div className="flex justify-center py-1 text-sig-dim/30 cursor-grab active:cursor-grabbing">
        <GripHorizontal size={WalkthroughTooltipIconMetric.DragSize} />
      </div>
      <div className="px-4 pt-0 pb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-sig-dim tracking-widest font-semibold">
            {stepIndex + 1} / {totalSteps}
          </span>
          <span className="text-[10px] tracking-wider uppercase">
            {action ? (
              <span className="text-sig-warn">DO THIS</span>
            ) : (
              <span className="text-sig-dim/60">{phase}</span>
            )}
          </span>
        </div>

        <div className="text-sm font-semibold text-sig-bright tracking-wider mb-1.5">
          {step.title}
        </div>
        <div className="text-sm text-sig-text leading-relaxed mb-4">
          {colorizedDescription(step.description)}
        </div>
        <StepProgress
          action={action}
          stepIndex={stepIndex}
          totalSteps={totalSteps}
        />

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type={ButtonType.Button}
            onClick={onSkip}
            className="px-2 py-1.5 rounded text-[11px] font-semibold tracking-wider text-sig-dim hover:text-sig-text transition-colors flex items-center gap-1"
          >
            <X
              size={WalkthroughTooltipIconMetric.CloseSize}
              strokeWidth={WalkthroughTooltipIconMetric.StrokeWidth}
            />
            SKIP
          </button>
          <button
            type={ButtonType.Button}
            onClick={onDismiss}
            className="px-2 py-1.5 rounded text-[10px] tracking-wider text-sig-dim/50 hover:text-sig-dim transition-colors"
          >
            DON&apos;T SHOW AGAIN
          </button>
          <div className="flex-1 basis-full sm:basis-0" />
          {stepIndex > 0 && (
            <button
              type={ButtonType.Button}
              onClick={onBack}
              className="px-2.5 py-1.5 rounded text-[11px] font-semibold tracking-wider text-sig-dim border border-sig-border/50 hover:text-sig-text hover:border-sig-border transition-colors flex items-center gap-1"
            >
              <ChevronLeft
                size={WalkthroughTooltipIconMetric.BackSize}
                strokeWidth={WalkthroughTooltipIconMetric.StrokeWidth}
              />
              BACK
            </button>
          )}
          {!action && (
            <button
              type={ButtonType.Button}
              onClick={onNext}
              className="px-3 py-1.5 rounded text-[11px] font-semibold tracking-wider text-sig-bg bg-sig-accent hover:bg-sig-accent/90 transition-colors flex items-center gap-1"
            >
              {nextLabel}
              <ChevronRight
                size={WalkthroughTooltipIconMetric.BackSize}
                strokeWidth={WalkthroughTooltipIconMetric.StrokeWidth}
              />
            </button>
          )}
          {action && (
            <span className="text-[10px] text-sig-warn/70 tracking-wider animate-pulse">
              WAITING FOR ACTION...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function WalkthroughTooltip(props: WalkthroughTooltipProps) {
  const action = props.step.mode === WalkthroughStepMode.Action;
  return (
    <div
      ref={props.tooltipRef}
      role="dialog"
      aria-label={props.step.title}
      data-wt-dragging={props.dragging}
      data-wt-ready={props.ready}
      data-wt-style={WalkthroughStyleSlot.Tooltip}
      onPointerDown={props.onPointerDown}
      className="absolute invisible data-[wt-ready=true]:visible cursor-grab active:cursor-grabbing"
    >
      {props.isMobile && action ? (
        <MobileActionTooltip
          onSkip={props.onSkip}
          step={props.step}
          stepIndex={props.stepIndex}
          totalSteps={props.totalSteps}
        />
      ) : (
        <FullTooltip {...props} />
      )}
    </div>
  );
}

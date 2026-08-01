import {
  WalkthroughClickMode,
  WalkthroughTourTarget,
  walkthroughTourSelector,
} from "../model";
import type { WalkthroughPoint } from "./geometry";

enum ClickIndicatorRatio {
  GlobeRadius = 0.4,
  SelectVertical = 0.25,
  SelectHorizontal = 0.22,
}

enum ClickIndicatorSize {
  CandidateInset = 60,
  Height = 80,
  Width = 100,
}

enum ClickIndicatorDivisor {
  Half = 2,
}

enum ClickIndicatorSelector {
  PanelContainer = "div.absolute, div.fixed",
  Tooltip = ".cursor-grab",
}

type GlobeMetrics = Readonly<{
  centerX: number;
  centerY: number;
  radius: number;
}>;

function globeMetrics(rect: DOMRect): GlobeMetrics {
  return {
    centerX: rect.left + rect.width / ClickIndicatorDivisor.Half,
    centerY: rect.top + rect.height / ClickIndicatorDivisor.Half,
    radius:
      Math.min(rect.width, rect.height) * ClickIndicatorRatio.GlobeRadius,
  };
}

function selectionPoint(metrics: GlobeMetrics): WalkthroughPoint {
  return {
    x:
      metrics.centerX -
      metrics.radius * ClickIndicatorRatio.SelectHorizontal,
    y:
      metrics.centerY -
      metrics.radius * ClickIndicatorRatio.SelectVertical,
  };
}

function obstacles(
  metrics: GlobeMetrics,
): readonly DOMRect[] {
  const result = [
    new DOMRect(
      metrics.centerX - metrics.radius,
      metrics.centerY - metrics.radius,
      metrics.radius * ClickIndicatorDivisor.Half,
      metrics.radius * ClickIndicatorDivisor.Half,
    ),
  ];
  const detailHandle = document.querySelector(
    walkthroughTourSelector(WalkthroughTourTarget.DetailDragHandle),
  );
  const panel = detailHandle?.closest(ClickIndicatorSelector.PanelContainer);
  if (panel) result.push(panel.getBoundingClientRect());

  const tooltip = document.querySelector(ClickIndicatorSelector.Tooltip);
  if (tooltip) result.push(tooltip.getBoundingClientRect());
  return result;
}

function emptySpaceCandidates(
  canvas: DOMRect,
  metrics: GlobeMetrics,
): readonly WalkthroughPoint[] {
  const inset = ClickIndicatorSize.CandidateInset;
  const bottom = canvas.top + canvas.height - ClickIndicatorSize.Height;
  const right = canvas.left + canvas.width - inset;
  return [
    { x: canvas.left + inset, y: bottom },
    { x: right, y: bottom },
    { x: canvas.left + inset, y: canvas.top + inset },
    { x: right, y: canvas.top + inset },
    { x: canvas.left + inset, y: metrics.centerY },
    { x: right, y: metrics.centerY },
    { x: metrics.centerX, y: bottom },
    { x: metrics.centerX, y: canvas.top + inset },
  ];
}

function pointOverlaps(
  point: WalkthroughPoint,
  obstacle: DOMRect,
): boolean {
  const half = ClickIndicatorDivisor.Half;
  return (
    point.x + ClickIndicatorSize.Width / half > obstacle.left &&
    point.x - ClickIndicatorSize.Width / half < obstacle.right &&
    point.y + ClickIndicatorSize.Height / half > obstacle.top &&
    point.y - ClickIndicatorSize.Height / half < obstacle.bottom
  );
}

export function clickIndicatorPoint(
  mode: WalkthroughClickMode,
): WalkthroughPoint | null {
  const canvas = document.querySelector(
    `${walkthroughTourSelector(WalkthroughTourTarget.GlobePane)} canvas`,
  );
  if (!canvas) return null;
  const canvasRect = canvas.getBoundingClientRect();
  const metrics = globeMetrics(canvasRect);
  if (mode === WalkthroughClickMode.Select) return selectionPoint(metrics);

  const occupied = obstacles(metrics);
  const candidates = emptySpaceCandidates(canvasRect, metrics);
  return (
    candidates.find(
      (candidate) =>
        !occupied.some((obstacle) => pointOverlaps(candidate, obstacle)),
    ) ?? candidates.at(0) ?? null
  );
}

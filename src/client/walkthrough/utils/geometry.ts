import { WalkthroughPlacement, WalkthroughStepId } from "../model/vocabulary";

export type WalkthroughRect = Readonly<{
  height: number;
  left: number;
  top: number;
  width: number;
}>;

export type WalkthroughPoint = Readonly<{
  x: number;
  y: number;
}>;

export enum WalkthroughSpacing {
  Cutout = 8,
  Obstacle = 10,
  Viewport = 12,
  Tooltip = 14,
}

export enum WalkthroughTooltipWidth {
  Mobile = 280,
  Desktop = 340,
}

export enum WalkthroughRadius {
  Cutout = 8,
}

enum WalkthroughGeometryDivisor {
  Half = 2,
}

enum WalkthroughElementSelector {
  Indicator = "[data-wt-indicator]",
  Menu = "[data-wt-menu]",
}

const GLOBE_ACTION_STEPS: ReadonlySet<WalkthroughStepId> = new Set([
  WalkthroughStepId.GlobeSelect,
  WalkthroughStepId.GlobeDeselect,
  WalkthroughStepId.MobileDetailSheet,
]);

export function getWalkthroughTargetRect(
  selector: string,
): WalkthroughRect | null {
  if (!selector) return null;
  const candidates = document.querySelectorAll(selector);
  for (const candidate of candidates) {
    const rect = candidate.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      };
    }
  }

  const fallback = candidates.item(0)?.getBoundingClientRect();
  return fallback
    ? {
        top: fallback.top,
        left: fallback.left,
        width: fallback.width,
        height: fallback.height,
      }
    : null;
}

export function walkthroughCutoutRect(
  target: WalkthroughRect,
): WalkthroughRect {
  const padding = WalkthroughSpacing.Cutout;
  return {
    top: target.top - padding,
    left: target.left - padding,
    width: target.width + padding * WalkthroughGeometryDivisor.Half,
    height: target.height + padding * WalkthroughGeometryDivisor.Half,
  };
}

function paddedObstacle(rect: WalkthroughRect): DOMRect {
  const pad = WalkthroughSpacing.Obstacle;
  return new DOMRect(
    rect.left - pad,
    rect.top - pad,
    rect.width + pad * WalkthroughGeometryDivisor.Half,
    rect.height + pad * WalkthroughGeometryDivisor.Half,
  );
}

function collectObstacles(
  target: WalkthroughRect | null,
  selectors: readonly string[],
): readonly DOMRect[] {
  const obstacles: DOMRect[] = [];
  for (const selector of selectors) {
    const rect = getWalkthroughTargetRect(selector);
    if (rect && rect.width > 0) obstacles.push(paddedObstacle(rect));
  }

  for (const menu of document.querySelectorAll(
    WalkthroughElementSelector.Menu,
  )) {
    const rect = menu.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) obstacles.push(rect);
  }

  const indicator = document.querySelector(
    WalkthroughElementSelector.Indicator,
  );
  if (indicator) {
    const rect = indicator.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) obstacles.push(rect);
  }

  if (target && target.width > 0) {
    const pad = WalkthroughSpacing.Cutout;
    obstacles.push(
      new DOMRect(
        target.left - pad,
        target.top - pad,
        target.width + pad * WalkthroughGeometryDivisor.Half,
        target.height + pad * WalkthroughGeometryDivisor.Half,
      ),
    );
  }
  return obstacles;
}

function overlapsObstacle(
  point: WalkthroughPoint,
  tooltipWidth: number,
  tooltipHeight: number,
  obstacles: readonly DOMRect[],
): boolean {
  return obstacles.some(
    (obstacle) =>
      point.x + tooltipWidth > obstacle.left &&
      point.x < obstacle.right &&
      point.y + tooltipHeight > obstacle.top &&
      point.y < obstacle.bottom,
  );
}

function directionalCandidates(
  target: WalkthroughRect,
  tooltipWidth: number,
  tooltipHeight: number,
): readonly WalkthroughPoint[] {
  const half = WalkthroughGeometryDivisor.Half;
  const centerX = target.left + target.width / half;
  const centerY = target.top + target.height / half;
  const offset = WalkthroughSpacing.Cutout + WalkthroughSpacing.Tooltip;
  return [
    {
      x: centerX - tooltipWidth / half,
      y: target.top - offset - tooltipHeight,
    },
    {
      x: centerX - tooltipWidth / half,
      y: target.top + target.height + offset,
    },
    {
      x: target.left + target.width + offset,
      y: centerY - tooltipHeight / half,
    },
    {
      x: target.left - offset - tooltipWidth,
      y: centerY - tooltipHeight / half,
    },
  ];
}

function obstacleCandidates(
  centerX: number,
  tooltipHeight: number,
  obstacles: readonly DOMRect[],
): readonly WalkthroughPoint[] {
  return obstacles.flatMap((obstacle) => [
    {
      x: centerX,
      y: obstacle.top - tooltipHeight - WalkthroughSpacing.Cutout,
    },
    {
      x: centerX,
      y: obstacle.bottom + WalkthroughSpacing.Cutout,
    },
  ]);
}

function standardCandidates(
  viewportWidth: number,
  viewportHeight: number,
  viewportTop: number,
  tooltipWidth: number,
  tooltipHeight: number,
): readonly WalkthroughPoint[] {
  const pad = WalkthroughSpacing.Viewport;
  const half = WalkthroughGeometryDivisor.Half;
  const centerX = (viewportWidth - tooltipWidth) / half;
  const bottom = viewportTop + viewportHeight - tooltipHeight - pad;
  return [
    { x: centerX, y: viewportTop + pad },
    { x: centerX, y: bottom },
    {
      x: centerX,
      y: viewportTop + (viewportHeight - tooltipHeight) / half,
    },
    { x: pad, y: viewportTop + pad },
    { x: viewportWidth - tooltipWidth - pad, y: viewportTop + pad },
    { x: pad, y: bottom },
    { x: viewportWidth - tooltipWidth - pad, y: bottom },
  ];
}

function clampedCandidate(
  point: WalkthroughPoint,
  viewportWidth: number,
  viewportHeight: number,
  viewportTop: number,
  tooltipWidth: number,
  tooltipHeight: number,
): WalkthroughPoint {
  const pad = WalkthroughSpacing.Viewport;
  return {
    x: Math.max(
      pad,
      Math.min(viewportWidth - tooltipWidth - pad, point.x),
    ),
    y: Math.max(
      viewportTop + pad,
      Math.min(
        viewportTop + viewportHeight - tooltipHeight - pad,
        point.y,
      ),
    ),
  };
}

export function computeWalkthroughTooltipPosition(
  target: WalkthroughRect | null,
  placement: WalkthroughPlacement,
  tooltipWidth: number,
  tooltipHeight: number,
  stepId: WalkthroughStepId,
  selectors: readonly string[],
): WalkthroughPoint {
  const visualViewport = window.visualViewport;
  const viewportWidth = visualViewport?.width ?? window.innerWidth;
  const viewportHeight = visualViewport?.height ?? window.innerHeight;
  const viewportTop = visualViewport?.offsetTop ?? 0;
  const centerX =
    (viewportWidth - tooltipWidth) / WalkthroughGeometryDivisor.Half;

  if (stepId === WalkthroughStepId.Search) {
    return {
      x: centerX,
      y:
        window.innerHeight -
        tooltipHeight -
        WalkthroughSpacing.Viewport,
    };
  }

  const obstacles = collectObstacles(target, selectors);
  const directional =
    placement !== WalkthroughPlacement.Center && target
      ? directionalCandidates(target, tooltipWidth, tooltipHeight)
      : [];
  const candidates = [
    ...directional,
    ...obstacleCandidates(centerX, tooltipHeight, obstacles),
    ...standardCandidates(
      viewportWidth,
      viewportHeight,
      viewportTop,
      tooltipWidth,
      tooltipHeight,
    ),
  ];
  if (GLOBE_ACTION_STEPS.has(stepId)) {
    candidates.unshift({
      x: centerX,
      y: viewportTop + WalkthroughSpacing.Viewport,
    });
  }

  for (const candidate of candidates) {
    const clamped = clampedCandidate(
      candidate,
      viewportWidth,
      viewportHeight,
      viewportTop,
      tooltipWidth,
      tooltipHeight,
    );
    if (
      !overlapsObstacle(
        clamped,
        tooltipWidth,
        tooltipHeight,
        obstacles,
      )
    ) {
      return clamped;
    }
  }

  return {
    x: Math.max(WalkthroughSpacing.Viewport, centerX),
    y: viewportTop + WalkthroughSpacing.Viewport,
  };
}

import { drawSelectionRing } from "@/workers/render/primitives/selectionRing";
import type {
  MarkerGlow,
  MarkerPulseZoom,
} from "@/workers/render/primitives/markerStyle";

const FULL_CIRCLE_RADIANS = Math.PI * 2;

enum HexChannelBoundary {
  RedStart = 1,
  RedEndGreenStart = 3,
  GreenEndBlueStart = 5,
  BlueEnd = 7,
}

enum HexColorPolicy {
  Radix = 16,
  MaximumChannel = 255,
}

enum MarkerFadePolicy {
  UnchangedThreshold = 0.95,
}

export enum MarkerGlowPolicy {
  SpriteSizePixels = 128,
  MaximumCachedSprites = 512,
  RadiusToDiameter = 2,
  MinimumVisibleIntensity = 0.01,
  /** Only the strongest records keep a glow; each one costs a drawImage per frame. */
  MaximumGlowingMarkers = 500,
}

/** Dots that share a fill bucket: one path, one fill. */
enum DotBucket {
  SizeStep = 0.25,
  AlphaStep = 0.02,
}

enum GradientStop {
  Inner = 0,
  Outer = 1,
}

enum MarkerPulsePolicy {
  BaseScale = 1,
  IdRadix = 36,
}

enum DefaultMarkerPulseZoom {
  Floor = 1.3,
  Span = 2,
}

enum ThemeBrightnessPolicy {
  ChannelCount = 3,
  LightThreshold = 128,
}

enum MarkerColor {
  DarkBackground = "#080a0f",
  TransparentAlpha = "00",
}

export type PulsingMarkerGlow = Readonly<{
  intensity: number;
  pulseIndex: number;
  id: string;
  config: MarkerGlow;
}>;

export type PulsingMarker = Readonly<{
  x: number;
  y: number;
  size: number;
  color: string;
  fillAlpha: number;
  selected: boolean;
  glow: PulsingMarkerGlow | null;
  shape?: (size: number) => void;
}>;

export type DotBatch = {
  color: string;
  fillAlpha: number;
  size: number;
  xs: number[];
  ys: number[];
};

/** Batches by colour, then by a numeric size and alpha key; no strings per marker. */
export type DotBatchSet = Map<string, Map<number, DotBatch>>;

const DOT_KEY_STRIDE = 4096;

function quantize(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Alpha rounded to the batch step, so markers can share one fill. */
export function markerAlphaBucket(alpha: number): number {
  return quantize(alpha, DotBucket.AlphaStep);
}

/** File a plain marker into the batch that shares its colour, size, and alpha. */
export function addDot(batches: DotBatchSet, marker: PulsingMarker): void {
  const sizeIndex = Math.round(marker.size / DotBucket.SizeStep);
  const alphaIndex = Math.round(marker.fillAlpha / DotBucket.AlphaStep);
  let byKey = batches.get(marker.color);
  if (!byKey) {
    byKey = new Map();
    batches.set(marker.color, byKey);
  }
  const key = sizeIndex * DOT_KEY_STRIDE + alphaIndex;
  let batch = byKey.get(key);
  if (!batch) {
    batch = {
      color: marker.color,
      fillAlpha: alphaIndex * DotBucket.AlphaStep,
      size: sizeIndex * DotBucket.SizeStep,
      xs: [],
      ys: [],
    };
    byKey.set(key, batch);
  }
  batch.xs.push(marker.x);
  batch.ys.push(marker.y);
}

/** Every batch in the set, for one fill each. */
export function* dotBatches(batches: DotBatchSet): IterableIterator<DotBatch> {
  for (const byKey of batches.values()) yield* byKey.values();
}

/** One path and one fill for every dot in the batch. */
export function fillDotBatch(
  context: OffscreenCanvasRenderingContext2D,
  batch: DotBatch,
): void {
  context.globalAlpha = batch.fillAlpha;
  context.fillStyle = batch.color;
  context.beginPath();
  for (const [index, x] of batch.xs.entries()) {
    const y = batch.ys[index] ?? 0;
    context.moveTo(x + batch.size, y);
    context.arc(x, y, batch.size, 0, FULL_CIRCLE_RADIANS);
  }
  context.fill();
}

/** Dot marker for a track drawn below the motion-detail zoom. */
export function trackDot(
  x: number,
  y: number,
  size: number,
  color: string,
  fillAlpha: number,
): PulsingMarker {
  return { x, y, size, color, fillAlpha, selected: false, glow: null };
}

export type MarkerVisualRenderer = Readonly<{
  fade: (color: string, factor: number) => string;
  fillDots: (
    context: OffscreenCanvasRenderingContext2D,
    batch: DotBatch,
  ) => void;
  drawPulsing: (
    context: OffscreenCanvasRenderingContext2D,
    time: number,
    marker: PulsingMarker,
  ) => void;
  drawPulseGlow: (
    context: OffscreenCanvasRenderingContext2D,
    time: number,
    marker: PulsingMarker,
    glow: PulsingMarkerGlow,
  ) => void;
}>;

function parseHex(hex: string): [number, number, number] {
  return [
    Number.parseInt(
      hex.slice(
        HexChannelBoundary.RedStart,
        HexChannelBoundary.RedEndGreenStart,
      ),
      HexColorPolicy.Radix,
    ) || GradientStop.Inner,
    Number.parseInt(
      hex.slice(
        HexChannelBoundary.RedEndGreenStart,
        HexChannelBoundary.GreenEndBlueStart,
      ),
      HexColorPolicy.Radix,
    ) || GradientStop.Inner,
    Number.parseInt(
      hex.slice(
        HexChannelBoundary.GreenEndBlueStart,
        HexChannelBoundary.BlueEnd,
      ),
      HexColorPolicy.Radix,
    ) || GradientStop.Inner,
  ];
}

function channelHex(value: number): string {
  return Math.max(
    GradientStop.Inner,
    Math.min(HexColorPolicy.MaximumChannel, Math.round(value)),
  )
    .toString(HexColorPolicy.Radix)
    .padStart(MarkerGlowPolicy.RadiusToDiameter, "0");
}

function toHex(red: number, green: number, blue: number): string {
  return `#${channelHex(red)}${channelHex(green)}${channelHex(blue)}`;
}

export function markerPulseIntensity(
  zoomLevel: number,
  policy?: MarkerPulseZoom,
): number {
  return Math.max(
    0,
    Math.min(
      1,
      (zoomLevel - (policy?.floor ?? DefaultMarkerPulseZoom.Floor)) /
        (policy?.span ?? DefaultMarkerPulseZoom.Span),
    ),
  );
}

export class MarkerVisuals {
  private readonly glowSprites = new Map<string, OffscreenCanvas>();

  isLight(background: string | undefined): boolean {
    const [red, green, blue] = parseHex(
      background || MarkerColor.DarkBackground,
    );
    return (
      (red + green + blue) / ThemeBrightnessPolicy.ChannelCount >
      ThemeBrightnessPolicy.LightThreshold
    );
  }

  fade(color: string, factor: number): string {
    if (factor >= MarkerFadePolicy.UnchangedThreshold) return color;
    const [red, green, blue] = parseHex(color);
    return toHex(red * factor, green * factor, blue * factor);
  }

  drawGlow(
    context: OffscreenCanvasRenderingContext2D,
    color: string,
    alphaHex: string,
    x: number,
    y: number,
    radius: number,
    alpha: number,
  ): void {
    context.globalAlpha = alpha;
    context.drawImage(
      this.glowSprite(color, alphaHex),
      x - radius,
      y - radius,
      radius * MarkerGlowPolicy.RadiusToDiameter,
      radius * MarkerGlowPolicy.RadiusToDiameter,
    );
  }

  fillDots(
    context: OffscreenCanvasRenderingContext2D,
    batch: DotBatch,
  ): void {
    fillDotBatch(context, batch);
  }

  drawPulsing(
    context: OffscreenCanvasRenderingContext2D,
    time: number,
    marker: PulsingMarker,
  ): void {
    if (
      marker.glow &&
      marker.glow.intensity >
        MarkerGlowPolicy.MinimumVisibleIntensity
    ) {
      this.drawPulseGlow(context, time, marker, marker.glow);
    }
    context.globalAlpha = marker.fillAlpha;
    context.fillStyle = marker.color;
    if (marker.shape) {
      marker.shape(marker.size);
    } else {
      context.beginPath();
      context.arc(
        marker.x,
        marker.y,
        marker.size,
        0,
        FULL_CIRCLE_RADIANS,
      );
    }
    context.fill();
    if (marker.selected) {
      drawSelectionRing(
        context,
        marker.x,
        marker.y,
        marker.size,
        marker.color,
        time,
      );
    }
    context.globalAlpha = MarkerPulsePolicy.BaseScale;
  }

  drawPulseGlow(
    context: OffscreenCanvasRenderingContext2D,
    time: number,
    marker: PulsingMarker,
    glow: PulsingMarkerGlow,
  ): void {
    const config = glow.config;
    const phase =
      (Number.parseInt(
        glow.id.slice(config.idSliceFrom),
        MarkerPulsePolicy.IdRadix,
      ) || GradientStop.Inner) * config.rate;
    const pulse =
      MarkerPulsePolicy.BaseScale +
      Math.sin(time + phase) *
        (config.baseAmp + glow.pulseIndex * config.ampGain);
    const radius =
      marker.size *
      (config.radBase +
        glow.pulseIndex * (config.radGain ?? config.radBase)) *
      pulse;
    this.drawGlow(
      context,
      marker.color,
      config.alphaHex,
      marker.x,
      marker.y,
      radius,
      marker.fillAlpha * glow.intensity * config.glowMul,
    );
  }

  private glowSprite(color: string, alphaHex: string): OffscreenCanvas {
    const key = color + alphaHex;
    const cached = this.glowSprites.get(key);
    if (cached) return cached;
    if (
      this.glowSprites.size >
      MarkerGlowPolicy.MaximumCachedSprites
    ) {
      this.glowSprites.clear();
    }
    const canvas = new OffscreenCanvas(
      MarkerGlowPolicy.SpriteSizePixels,
      MarkerGlowPolicy.SpriteSizePixels,
    );
    const context = canvas.getContext("2d");
    if (!context) return canvas;
    const radius =
      MarkerGlowPolicy.SpriteSizePixels /
      MarkerGlowPolicy.RadiusToDiameter;
    const gradient = context.createRadialGradient(
      radius,
      radius,
      GradientStop.Inner,
      radius,
      radius,
      radius,
    );
    gradient.addColorStop(
      GradientStop.Inner,
      color + alphaHex,
    );
    gradient.addColorStop(
      GradientStop.Outer,
      color + MarkerColor.TransparentAlpha,
    );
    context.fillStyle = gradient;
    context.fillRect(
      GradientStop.Inner,
      GradientStop.Inner,
      MarkerGlowPolicy.SpriteSizePixels,
      MarkerGlowPolicy.SpriteSizePixels,
    );
    this.glowSprites.set(key, canvas);
    return canvas;
  }
}

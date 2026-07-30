import type { Ctx } from "@/features/environmental/cyclones/render/cycloneGeometry";
import { drawSelectionRing } from "@/workers/render/primitives/selectionRing";
import type { MarkerGlow } from "@/workers/render/primitives/markerStyle";

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

enum MarkerGlowPolicy {
  SpriteSizePixels = 128,
  MaximumCachedSprites = 512,
  RadiusToDiameter = 2,
  MinimumVisibleIntensity = 0.01,
}

enum GradientStop {
  Inner = 0,
  Outer = 1,
}

enum MarkerPulsePolicy {
  BaseScale = 1,
  IdRadix = 36,
}

enum MarkerPulseZoom {
  Floor = 1.3,
  Span = 2,
}

enum NormalizedIntensity {
  Minimum = 0,
  Maximum = 1,
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
  shape: (size: number) => void;
}>;

export type MarkerVisualRenderer = Readonly<{
  fade: (color: string, factor: number) => string;
  drawPulsing: (
    context: Ctx,
    time: number,
    marker: PulsingMarker,
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

export function markerPulseIntensity(zoomLevel: number): number {
  return Math.max(
    NormalizedIntensity.Minimum,
    Math.min(
      NormalizedIntensity.Maximum,
      (zoomLevel - MarkerPulseZoom.Floor) / MarkerPulseZoom.Span,
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
    context: Ctx,
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

  drawPulsing(
    context: Ctx,
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
    marker.shape(marker.size);
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

  private drawPulseGlow(
    context: Ctx,
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
      (config.radBase + glow.pulseIndex * config.radGain) *
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

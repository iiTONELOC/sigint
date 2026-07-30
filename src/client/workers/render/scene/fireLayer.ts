import type { Ctx } from "@/features/environmental/cyclones/render/cycloneGeometry";
import type { MarkerGlow } from "@/workers/render/primitives/markerStyle";
import type {
  MarkerVisualRenderer,
} from "@/workers/render/primitives/markerVisuals";
import {
  FireSceneAttribute,
  FireSceneSchema,
} from "@/workers/render/scene/fireSchema";
import {
  RenderLayerOrder,
  ScenePointLayer,
  type SceneLayerProjectionFrame,
} from "@/workers/render/scene/sceneLayer";
import {
  sceneRecordIsVisible,
  type SceneVisibilitySettings,
} from "@/workers/render/scene/visibility";
import type { RenderSceneView } from "@/workers/render/sceneStore";
import { zoomScale } from "@/workers/render/workerMath";
import { Domain } from "@shared/domain/identity";
import {
  MS_PER_DAY,
  MS_PER_HOUR,
} from "@shared/time";

enum FirePowerBand {
  One = 1,
  Five = 5,
  Ten = 10,
  TwentyFive = 25,
  Fifty = 50,
  Hundred = 100,
}

enum FireMarkerRadius {
  UnderOne = 0.8,
  UnderFive = 1,
  UnderTen = 1.3,
  UnderTwentyFive = 1.8,
  UnderFifty = 2.5,
  UnderHundred = 3.5,
  Maximum = 4.5,
}

enum FireSelectionScale {
  Selected = 2,
}

enum FireAgeSpan {
  RecentHours = 3,
  AgingHours = 6,
}

enum FireAgeDivisor {
  HalfDay = 2,
}

enum FireAgeAlpha {
  OldOrMissing = 0.5,
  Fresh = 1,
  Recent = 0.9,
  Aging = 0.8,
  HalfDay = 0.65,
}

enum FireMarkerAlpha {
  DepthBase = 0.4,
  DepthGain = 0.6,
  MarkerGain = 0.5,
}

enum FireAnimationPolicy {
  PowerThreshold = 15,
  PowerSpan = 85,
}

enum FireGlowTuning {
  IdSliceFrom = 2,
  Rate = 0.6,
  BaseAmplitude = 0.05,
  AmplitudeGain = 0.15,
  Radius = 1.5,
  AlphaMultiplier = 0.35,
}

enum FirePulseZoom {
  Floor = 1.5,
  Span = 2.5,
}

enum FireGlowAlpha {
  Hex = "30",
}

enum FireMarkerGeometry {
  FullCircleRadians = 2,
}

enum FireTimestamp {
  Missing = 0,
}

enum NormalizedScale {
  Minimum = 0,
  Maximum = 1,
}

export type FireSceneFilter = SceneVisibilitySettings &
  Readonly<{
    enabled: boolean;
    minimumConfidence: number;
  }>;

export type FireSceneStyle = Readonly<{
  context: Ctx;
  color: string;
  selectedId: string | null;
  time: number;
  now: number;
  zoomLevel: number;
}>;

function numericAttribute(
  view: RenderSceneView,
  index: number,
  attribute: FireSceneAttribute,
): number {
  return (
    view.attributes[index * view.attributeStride + attribute] ??
    NormalizedScale.Minimum
  );
}

function radiativePowerAt(
  view: RenderSceneView,
  index: number,
): number {
  return numericAttribute(
    view,
    index,
    FireSceneAttribute.RadiativePower,
  );
}

function markerRadius(power: number): number {
  if (power < FirePowerBand.One) return FireMarkerRadius.UnderOne;
  if (power < FirePowerBand.Five) return FireMarkerRadius.UnderFive;
  if (power < FirePowerBand.Ten) return FireMarkerRadius.UnderTen;
  if (power < FirePowerBand.TwentyFive) {
    return FireMarkerRadius.UnderTwentyFive;
  }
  if (power < FirePowerBand.Fifty) return FireMarkerRadius.UnderFifty;
  if (power < FirePowerBand.Hundred) {
    return FireMarkerRadius.UnderHundred;
  }
  return FireMarkerRadius.Maximum;
}

function ageAlpha(timestamp: number, now: number): number {
  if (timestamp === FireTimestamp.Missing) {
    return FireAgeAlpha.OldOrMissing;
  }
  const age = now - timestamp;
  if (age < MS_PER_HOUR) return FireAgeAlpha.Fresh;
  if (age < FireAgeSpan.RecentHours * MS_PER_HOUR) {
    return FireAgeAlpha.Recent;
  }
  if (age < FireAgeSpan.AgingHours * MS_PER_HOUR) {
    return FireAgeAlpha.Aging;
  }
  if (age < MS_PER_DAY / FireAgeDivisor.HalfDay) {
    return FireAgeAlpha.HalfDay;
  }
  return FireAgeAlpha.OldOrMissing;
}

function pulseIntensity(zoomLevel: number): number {
  return Math.max(
    NormalizedScale.Minimum,
    Math.min(
      NormalizedScale.Maximum,
      (zoomLevel - FirePulseZoom.Floor) / FirePulseZoom.Span,
    ),
  );
}

function hasCompatibleSchema(view: RenderSceneView): boolean {
  return (
    view.attributeStride === FireSceneSchema.AttributeStride &&
    view.stringAttributeStride ===
      FireSceneSchema.StringAttributeStride
  );
}

export function fireSceneIncludes(
  view: RenderSceneView,
  index: number,
  settings: FireSceneFilter,
): boolean {
  return (
    hasCompatibleSchema(view) &&
    numericAttribute(
      view,
      index,
      FireSceneAttribute.Confidence,
    ) >= settings.minimumConfidence &&
    sceneRecordIsVisible(
      view,
      index,
      Domain.Fires,
      settings.enabled,
      settings,
    )
  );
}

export class FireLayer extends ScenePointLayer<
  FireSceneFilter,
  FireSceneStyle
> {
  readonly order = RenderLayerOrder.Fire;

  private readonly glow: MarkerGlow = {
    idSliceFrom: FireGlowTuning.IdSliceFrom,
    rate: FireGlowTuning.Rate,
    baseAmp: FireGlowTuning.BaseAmplitude,
    ampGain: FireGlowTuning.AmplitudeGain,
    radBase: FireGlowTuning.Radius,
    radGain: FireGlowTuning.Radius,
    alphaHex: FireGlowAlpha.Hex,
    glowMul: FireGlowTuning.AlphaMultiplier,
  };

  private readonly visuals: MarkerVisualRenderer;
  private animated = false;

  constructor(visuals: MarkerVisualRenderer) {
    super(Domain.Fire);
    this.visuals = visuals;
  }

  override project(
    frame: SceneLayerProjectionFrame,
    filter: FireSceneFilter,
  ): void {
    super.project(frame, filter);
    const view = this.view;
    this.animated = false;
    if (!view) return;
    for (const index of this.visibleIndices()) {
      if (
        radiativePowerAt(view, index) >
        FireAnimationPolicy.PowerThreshold
      ) {
        this.animated = true;
        return;
      }
    }
  }

  override hasTimeAnimation(reducedMotion: boolean): boolean {
    return !reducedMotion && this.animated;
  }

  protected includes(
    view: RenderSceneView,
    index: number,
    filter: FireSceneFilter,
  ): boolean {
    return fireSceneIncludes(view, index, filter);
  }

  protected drawRecord(
    view: RenderSceneView,
    index: number,
    style: FireSceneStyle,
  ): void {
    const projection = this.projection.projection(index);
    const entityId = view.entityIds[index];
    const timestamp = view.timestamps[index];
    if (!projection || !entityId || timestamp === undefined) return;

    const power = radiativePowerAt(view, index);
    const alpha = ageAlpha(timestamp, style.now);
    const selected = entityId === style.selectedId;
    const size =
      markerRadius(power) *
      zoomScale(style.zoomLevel) *
      (selected
        ? FireSelectionScale.Selected
        : NormalizedScale.Maximum);
    const color = this.visuals.fade(style.color, alpha);
    this.visuals.drawPulsing(style.context, style.time, {
      x: projection.x,
      y: projection.y,
      size,
      color,
      fillAlpha:
        (FireMarkerAlpha.DepthBase +
          projection.depth * FireMarkerAlpha.DepthGain) *
        alpha *
        FireMarkerAlpha.MarkerGain,
      selected,
      glow:
        power > FireAnimationPolicy.PowerThreshold
          ? {
              intensity: pulseIntensity(style.zoomLevel),
              pulseIndex: Math.min(
                NormalizedScale.Maximum,
                (power - FireAnimationPolicy.PowerThreshold) /
                  FireAnimationPolicy.PowerSpan,
              ),
              id: entityId,
              config: this.glow,
            }
          : null,
      shape: (radius) => {
        style.context.beginPath();
        style.context.arc(
          projection.x,
          projection.y,
          radius,
          NormalizedScale.Minimum,
          Math.PI * FireMarkerGeometry.FullCircleRadians,
        );
      },
    });
  }
}

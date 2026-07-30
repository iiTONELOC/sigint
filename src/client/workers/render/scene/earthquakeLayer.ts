import type { Ctx } from "@/features/environmental/cyclones/render/cycloneGeometry";
import type { MarkerGlow } from "@/workers/render/primitives/markerStyle";
import {
  markerPulseIntensity,
  type MarkerVisualRenderer,
} from "@/workers/render/primitives/markerVisuals";
import {
  EarthquakeSceneAttribute,
  EarthquakeSceneSchema,
} from "@/workers/render/scene/earthquakeSchema";
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

enum EarthquakeMagnitudeBand {
  One = 1,
  Two = 2,
  Three = 3,
  Four = 4,
  Five = 5,
  Six = 6,
  Seven = 7,
}

enum EarthquakeMarkerRadius {
  UnderOne = 1.2,
  UnderTwo = 1.5,
  UnderThree = 2,
  UnderFour = 3,
  UnderFive = 4.5,
  UnderSix = 6,
  UnderSeven = 8,
  Maximum = 10,
}

enum EarthquakeSelectionScale {
  Selected = 2,
}

enum EarthquakeAgeSpan {
  RecentHours = 6,
  SeveralDays = 3,
}

enum EarthquakeAgeAlpha {
  Missing = 0.5,
  Fresh = 1,
  Recent = 0.9,
  DayOld = 0.8,
  SeveralDays = 0.65,
}

enum EarthquakeMarkerAlpha {
  DepthBase = 0.4,
  DepthGain = 0.6,
  MarkerGain = 0.8,
}

enum EarthquakeAnimationPolicy {
  MagnitudeThreshold = 3,
  MagnitudeSpan = 4,
}

enum EarthquakeGlowTuning {
  IdSliceFrom = 1,
  Rate = 0.7,
  BaseAmplitude = 0.1,
  AmplitudeGain = 0.2,
  RadiusBase = 1.8,
  RadiusGain = 1.5,
  AlphaMultiplier = 0.5,
}

enum EarthquakeGlowAlpha {
  Hex = "40",
}

enum EarthquakeMarkerGeometry {
  FullCircleRadians = 2,
}

enum EarthquakeTimestamp {
  Missing = 0,
}

enum NormalizedScale {
  Minimum = 0,
  Maximum = 1,
}

export type EarthquakeSceneFilter = SceneVisibilitySettings &
  Readonly<{
    enabled: boolean;
    minimumMagnitude: number;
  }>;

export type EarthquakeSceneStyle = Readonly<{
  context: Ctx;
  color: string;
  selectedId: string | null;
  time: number;
  now: number;
  zoomLevel: number;
}>;

function magnitudeAt(
  view: RenderSceneView,
  index: number,
): number {
  return (
    view.attributes[
      index * view.attributeStride +
        EarthquakeSceneAttribute.Magnitude
    ] ?? NormalizedScale.Minimum
  );
}

function markerRadius(magnitude: number): number {
  if (magnitude < EarthquakeMagnitudeBand.One) {
    return EarthquakeMarkerRadius.UnderOne;
  }
  if (magnitude < EarthquakeMagnitudeBand.Two) {
    return EarthquakeMarkerRadius.UnderTwo;
  }
  if (magnitude < EarthquakeMagnitudeBand.Three) {
    return EarthquakeMarkerRadius.UnderThree;
  }
  if (magnitude < EarthquakeMagnitudeBand.Four) {
    return EarthquakeMarkerRadius.UnderFour;
  }
  if (magnitude < EarthquakeMagnitudeBand.Five) {
    return EarthquakeMarkerRadius.UnderFive;
  }
  if (magnitude < EarthquakeMagnitudeBand.Six) {
    return EarthquakeMarkerRadius.UnderSix;
  }
  if (magnitude < EarthquakeMagnitudeBand.Seven) {
    return EarthquakeMarkerRadius.UnderSeven;
  }
  return EarthquakeMarkerRadius.Maximum;
}

function ageAlpha(timestamp: number, now: number): number {
  if (timestamp === EarthquakeTimestamp.Missing) {
    return EarthquakeAgeAlpha.Missing;
  }
  const age = now - timestamp;
  if (age < MS_PER_HOUR) return EarthquakeAgeAlpha.Fresh;
  if (age < EarthquakeAgeSpan.RecentHours * MS_PER_HOUR) {
    return EarthquakeAgeAlpha.Recent;
  }
  if (age < MS_PER_DAY) return EarthquakeAgeAlpha.DayOld;
  if (age < EarthquakeAgeSpan.SeveralDays * MS_PER_DAY) {
    return EarthquakeAgeAlpha.SeveralDays;
  }
  return EarthquakeAgeAlpha.Missing;
}

function hasCompatibleSchema(view: RenderSceneView): boolean {
  return (
    view.attributeStride ===
      EarthquakeSceneSchema.AttributeStride &&
    view.stringAttributeStride ===
      EarthquakeSceneSchema.StringAttributeStride
  );
}

export function earthquakeSceneIncludes(
  view: RenderSceneView,
  index: number,
  settings: EarthquakeSceneFilter,
): boolean {
  return (
    hasCompatibleSchema(view) &&
    magnitudeAt(view, index) >= settings.minimumMagnitude &&
    sceneRecordIsVisible(
      view,
      index,
      Domain.Quakes,
      settings.enabled,
      settings,
    )
  );
}

export class EarthquakeLayer extends ScenePointLayer<
  EarthquakeSceneFilter,
  EarthquakeSceneStyle
> {
  readonly order = RenderLayerOrder.Earthquake;

  private readonly glow: MarkerGlow = {
    idSliceFrom: EarthquakeGlowTuning.IdSliceFrom,
    rate: EarthquakeGlowTuning.Rate,
    baseAmp: EarthquakeGlowTuning.BaseAmplitude,
    ampGain: EarthquakeGlowTuning.AmplitudeGain,
    radBase: EarthquakeGlowTuning.RadiusBase,
    radGain: EarthquakeGlowTuning.RadiusGain,
    alphaHex: EarthquakeGlowAlpha.Hex,
    glowMul: EarthquakeGlowTuning.AlphaMultiplier,
  };

  private readonly visuals: MarkerVisualRenderer;
  private animated = false;

  constructor(visuals: MarkerVisualRenderer) {
    super(Domain.Earthquake);
    this.visuals = visuals;
  }

  override project(
    frame: SceneLayerProjectionFrame,
    filter: EarthquakeSceneFilter,
  ): void {
    super.project(frame, filter);
    const view = this.view;
    this.animated = false;
    if (!view) return;
    for (const index of this.visibleIndices()) {
      if (
        magnitudeAt(view, index) >
        EarthquakeAnimationPolicy.MagnitudeThreshold
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
    filter: EarthquakeSceneFilter,
  ): boolean {
    return earthquakeSceneIncludes(view, index, filter);
  }

  protected drawRecord(
    view: RenderSceneView,
    index: number,
    style: EarthquakeSceneStyle,
  ): void {
    const projection = this.projection.projection(index);
    const entityId = view.entityIds[index];
    const timestamp = view.timestamps[index];
    if (!projection || !entityId || timestamp === undefined) return;

    const magnitude = magnitudeAt(view, index);
    const alpha = ageAlpha(timestamp, style.now);
    const selected = entityId === style.selectedId;
    const size =
      markerRadius(magnitude) *
      zoomScale(style.zoomLevel) *
      (selected
        ? EarthquakeSelectionScale.Selected
        : NormalizedScale.Maximum);
    const color = this.visuals.fade(style.color, alpha);
    this.visuals.drawPulsing(style.context, style.time, {
      x: projection.x,
      y: projection.y,
      size,
      color,
      fillAlpha:
        (EarthquakeMarkerAlpha.DepthBase +
          projection.depth * EarthquakeMarkerAlpha.DepthGain) *
        alpha *
        EarthquakeMarkerAlpha.MarkerGain,
      selected,
      glow:
        magnitude > EarthquakeAnimationPolicy.MagnitudeThreshold
          ? {
              intensity: markerPulseIntensity(style.zoomLevel),
              pulseIndex: Math.min(
                NormalizedScale.Maximum,
                (magnitude -
                  EarthquakeAnimationPolicy.MagnitudeThreshold) /
                  EarthquakeAnimationPolicy.MagnitudeSpan,
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
          Math.PI *
            EarthquakeMarkerGeometry.FullCircleRadians,
        );
      },
    });
  }
}

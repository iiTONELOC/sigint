import type { Ctx } from "@/features/environmental/cyclones/render/cycloneGeometry";
import { EventSeverity } from "@/features/intel/events/types";
import type { MarkerGlow } from "@/workers/render/primitives/markerStyle";
import type {
  MarkerVisualRenderer,
} from "@/workers/render/primitives/markerVisuals";
import { markerPulseIntensity } from "@/workers/render/primitives/markerVisuals";
import {
  EventSceneAttribute,
  EventSceneSchema,
} from "@/workers/render/scene/eventSchema";
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

enum EventMarkerSize {
  MonitoringRadius = 1,
  ConcernRadius = 1.3,
  TensionRadius = 1.8,
  ConflictRadius = 2.5,
  CrisisRadius = 3.5,
  SelectedScale = 2,
}

enum EventAgeSpan {
  RecentHours = 6,
  SeveralDays = 3,
}

enum EventAgeAlpha {
  Missing = 0.5,
  Fresh = 1,
  Recent = 0.9,
  DayOld = 0.75,
  SeveralDays = 0.6,
  Older = 0.45,
}

enum EventDepthAlpha {
  Base = 0.4,
  Gain = 0.6,
}

enum EventMarkerAlpha {
  Gain = 0.75,
}

enum EventPulseSeverity {
  Base = 2,
  Span = 3,
}

enum EventGlowTuning {
  IdSliceFrom = 2,
  Rate = 0.5,
  BaseAmplitude = 0.1,
  AmplitudeGain = 0.2,
  RadiusBase = 1.8,
  RadiusGain = 1.2,
  AlphaMultiplier = 0.4,
}

enum EventGlowAlpha {
  Hex = "30",
}

enum EventMarkerGeometry {
  FullCircleRadians = 2,
}

enum EventTimestamp {
  Missing = 0,
}

enum NormalizedScale {
  Minimum = 0,
  Maximum = 1,
}

export type EventSceneFilter = SceneVisibilitySettings &
  Readonly<{ enabled: boolean }>;

export type EventSceneStyle = Readonly<{
  context: Ctx;
  color: string;
  selectedId: string | null;
  time: number;
  now: number;
  zoomLevel: number;
}>;

function severityAt(
  view: RenderSceneView,
  index: number,
): EventSeverity {
  const value =
    view.attributes[
      index * view.attributeStride + EventSceneAttribute.Severity
    ];
  if (value === EventSeverity.Concern) return EventSeverity.Concern;
  if (value === EventSeverity.Tension) return EventSeverity.Tension;
  if (value === EventSeverity.Conflict) return EventSeverity.Conflict;
  if (value === EventSeverity.Crisis) return EventSeverity.Crisis;
  return EventSeverity.Monitoring;
}

function markerSize(severity: EventSeverity): number {
  if (severity === EventSeverity.Concern) {
    return EventMarkerSize.ConcernRadius;
  }
  if (severity === EventSeverity.Tension) {
    return EventMarkerSize.TensionRadius;
  }
  if (severity === EventSeverity.Conflict) {
    return EventMarkerSize.ConflictRadius;
  }
  if (severity === EventSeverity.Crisis) {
    return EventMarkerSize.CrisisRadius;
  }
  return EventMarkerSize.MonitoringRadius;
}

function ageAlpha(timestamp: number, now: number): number {
  if (timestamp === EventTimestamp.Missing) {
    return EventAgeAlpha.Missing;
  }
  const age = now - timestamp;
  if (age < MS_PER_HOUR) return EventAgeAlpha.Fresh;
  if (age < EventAgeSpan.RecentHours * MS_PER_HOUR) {
    return EventAgeAlpha.Recent;
  }
  if (age < MS_PER_DAY) return EventAgeAlpha.DayOld;
  if (age < EventAgeSpan.SeveralDays * MS_PER_DAY) {
    return EventAgeAlpha.SeveralDays;
  }
  return EventAgeAlpha.Older;
}

function pulseIndex(severity: EventSeverity): number {
  return Math.min(
    NormalizedScale.Maximum,
    (severity - EventPulseSeverity.Base) /
      EventPulseSeverity.Span,
  );
}

function hasCompatibleSchema(view: RenderSceneView): boolean {
  return (
    view.attributeStride === EventSceneSchema.AttributeStride &&
    view.stringAttributeStride ===
      EventSceneSchema.StringAttributeStride
  );
}

export function eventSceneIncludes(
  view: RenderSceneView,
  index: number,
  settings: EventSceneFilter,
): boolean {
  return (
    hasCompatibleSchema(view) &&
    sceneRecordIsVisible(
      view,
      index,
      Domain.Events,
      settings.enabled,
      settings,
    )
  );
}

export class EventLayer extends ScenePointLayer<
  EventSceneFilter,
  EventSceneStyle
> {
  readonly order = RenderLayerOrder.Events;

  private readonly glow: MarkerGlow = {
    idSliceFrom: EventGlowTuning.IdSliceFrom,
    rate: EventGlowTuning.Rate,
    baseAmp: EventGlowTuning.BaseAmplitude,
    ampGain: EventGlowTuning.AmplitudeGain,
    radBase: EventGlowTuning.RadiusBase,
    radGain: EventGlowTuning.RadiusGain,
    alphaHex: EventGlowAlpha.Hex,
    glowMul: EventGlowTuning.AlphaMultiplier,
  };

  private readonly visuals: MarkerVisualRenderer;
  private animated = false;

  constructor(visuals: MarkerVisualRenderer) {
    super(Domain.Events);
    this.visuals = visuals;
  }

  override project(
    frame: SceneLayerProjectionFrame,
    filter: EventSceneFilter,
  ): void {
    super.project(frame, filter);
    const view = this.view;
    this.animated = false;
    if (!view) return;
    for (const index of this.visibleIndices()) {
      if (severityAt(view, index) >= EventSeverity.Tension) {
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
    filter: EventSceneFilter,
  ): boolean {
    return eventSceneIncludes(view, index, filter);
  }

  protected drawRecord(
    view: RenderSceneView,
    index: number,
    style: EventSceneStyle,
  ): void {
    const projection = this.projection.projection(index);
    const entityId = view.entityIds[index];
    const timestamp = view.timestamps[index];
    if (!projection || !entityId || timestamp === undefined) return;

    const severity = severityAt(view, index);
    const alpha = ageAlpha(timestamp, style.now);
    const selected = entityId === style.selectedId;
    const size =
      markerSize(severity) *
      zoomScale(style.zoomLevel) *
      (selected ? EventMarkerSize.SelectedScale : NormalizedScale.Maximum);
    const color = this.visuals.fade(style.color, alpha);
    this.visuals.drawPulsing(style.context, style.time, {
      x: projection.x,
      y: projection.y,
      size,
      color,
      fillAlpha:
        (EventDepthAlpha.Base +
          projection.depth * EventDepthAlpha.Gain) *
        alpha *
        EventMarkerAlpha.Gain,
      selected,
      glow:
        severity >= EventSeverity.Tension
          ? {
              intensity: markerPulseIntensity(style.zoomLevel),
              pulseIndex: pulseIndex(severity),
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
          Math.PI * EventMarkerGeometry.FullCircleRadians,
        );
      },
    });
  }
}

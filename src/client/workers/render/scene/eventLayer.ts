import type { Ctx } from "@/features/environmental/cyclones/render/cycloneGeometry";
import { EventSeverity } from "@/features/intel/events/types";
import type { MarkerGlow } from "@/workers/render/primitives/markerStyle";
import type {
  MarkerVisualRenderer,
} from "@/workers/render/primitives/markerVisuals";
import { markerPulseIntensity } from "@/workers/render/primitives/markerVisuals";
import {
  ProjectedSceneLayer,
  type SceneHit,
  type SceneProjection,
  type SceneProjectionFrame,
} from "@/workers/render/scene/projectedLayer";
import {
  EventSceneAttribute,
  EventSceneSchema,
} from "@/workers/render/scene/eventSchema";
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

type EventProjectionFrame = Omit<SceneProjectionFrame, "includes">;

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

export class EventLayer {
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

  private readonly projection = new ProjectedSceneLayer();
  private readonly visuals: MarkerVisualRenderer;
  private animated = false;
  private view: RenderSceneView | null = null;

  constructor(visuals: MarkerVisualRenderer) {
    this.visuals = visuals;
  }

  project(
    view: RenderSceneView,
    frame: EventProjectionFrame,
    filter: EventSceneFilter,
  ): void {
    this.view = view;
    this.projection.project(view, {
      ...frame,
      includes: (index) => eventSceneIncludes(view, index, filter),
    });
    this.animated = false;
    for (const index of this.projection.visibleIndices()) {
      if (severityAt(view, index) >= EventSeverity.Tension) {
        this.animated = true;
        return;
      }
    }
  }

  draw(style: EventSceneStyle): void {
    const view = this.view;
    if (!view) return;
    for (const index of this.projection.visibleIndices()) {
      this.drawRecord(view, index, style);
    }
  }

  nearest(
    x: number,
    y: number,
    radius: number,
    maximumCandidates: number,
  ): SceneHit | null {
    return this.projection.nearest(
      x,
      y,
      radius,
      maximumCandidates,
    );
  }

  selectionAnchor(entityId: string): SceneProjection | null {
    const view = this.view;
    if (!view) return null;
    for (const index of this.projection.visibleIndices()) {
      if (view.entityIds[index] === entityId) {
        return this.projection.projection(index);
      }
    }
    return null;
  }

  hasTimeAnimation(reducedMotion: boolean): boolean {
    return !reducedMotion && this.animated;
  }

  private drawRecord(
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

import {
  WEATHER_AREA_FILL,
  weatherAreaKind,
  weatherMarker,
  weatherPulse,
} from "@/features/environmental/weather/render";
import {
  type WeatherSeverity,
  weatherSeverityFromRank,
} from "@shared/domain/weather";
import { MarkerDepthAlpha } from "@/workers/render/primitives/markerStyle";
import {
  markerPulseIntensity,
  type MarkerVisualRenderer,
} from "@/workers/render/primitives/markerVisuals";
import {
  SceneAreaLayer,
  sceneAreaAlpha,
  type SceneAreaProjectionFrame,
} from "@/workers/render/scene/areaLayer";
import {
  RenderLayerOrder,
} from "@/workers/render/scene/sceneLayer";
import {
  sceneSourceIncludes,
  type EnabledSceneFilter,
} from "@/workers/render/scene/visibility";
import {
  sceneNumericAttribute,
  type RenderSceneView,
} from "@/workers/render/sceneStore";
import { zoomScale } from "@/workers/render/workerMath";
import { Domain } from "@shared/domain/identity";
import { WeatherSceneAttribute } from "@shared/scene";

enum WeatherMarkerScale {
  Selected = 2,
}

enum WeatherMarkerGeometry {
  Vertical = 1.2,
  Horizontal = 0.8,
}

export type WeatherSceneFilter = EnabledSceneFilter;

export type WeatherSceneStyle = Readonly<{
  context: OffscreenCanvasRenderingContext2D;
  color: string;
  selectedId: string | null;
  time: number;
  zoomLevel: number;
}>;

export type WeatherAreaStyle = Readonly<{
  context: OffscreenCanvasRenderingContext2D;
  selectedId: string | null;
  time: number;
}>;

function weatherSeverityAt(
  view: RenderSceneView,
  index: number,
): WeatherSeverity {
  return weatherSeverityFromRank(
    sceneNumericAttribute(
      view,
      index,
      WeatherSceneAttribute.Severity,
    ),
  );
}

export function weatherSceneIncludes(
  view: RenderSceneView,
  index: number,
  filter: WeatherSceneFilter,
): boolean {
  return sceneSourceIncludes(Domain.Weather, view, index, filter);
}

export class WeatherLayer extends SceneAreaLayer<WeatherSceneFilter> {
  readonly order = RenderLayerOrder.Weather;

  private readonly visuals: MarkerVisualRenderer;
  private animated = false;

  constructor(visuals: MarkerVisualRenderer) {
    super(Domain.Weather);
    this.visuals = visuals;
  }

  override project(
    frame: SceneAreaProjectionFrame,
    filter: WeatherSceneFilter,
  ): void {
    super.project(frame, filter);
    const view = this.view;
    this.animated = false;
    if (!view) return;
    for (const index of this.markerIndices()) {
      if (weatherPulse(weatherSeverityAt(view, index))) {
        this.animated = true;
        return;
      }
    }
  }

  override hasTimeAnimation(reducedMotion: boolean): boolean {
    return !reducedMotion && this.animated;
  }

  drawAreas(style: WeatherAreaStyle): void {
    this.drawAreaRecords(style.context, (view, index) => {
      const entityId = view.entityIds[index];
      const kind = weatherAreaKind(
        weatherSeverityAt(view, index),
      );
      return {
        color: WEATHER_AREA_FILL[kind],
        alpha: sceneAreaAlpha(
          kind,
          entityId === style.selectedId,
          style.time,
        ),
      };
    });
  }

  draw(style: WeatherSceneStyle): void {
    const view = this.view;
    if (!view) return;
    for (const index of this.markerIndices()) {
      const projection = this.markerProjection(index);
      const entityId = view.entityIds[index];
      if (!projection || !entityId) continue;
      const severity = weatherSeverityAt(view, index);
      const marker = weatherMarker(severity);
      const pulse = weatherPulse(severity);
      const selected = entityId === style.selectedId;
      const size =
        marker.size *
        zoomScale(style.zoomLevel) *
        (selected ? WeatherMarkerScale.Selected : 1);
      this.visuals.drawPulsing(style.context, style.time, {
        x: projection.x,
        y: projection.y,
        size,
        color: style.color,
        fillAlpha:
        (MarkerDepthAlpha.Base +
          projection.depth * MarkerDepthAlpha.Gain) *
          marker.alpha *
          MarkerDepthAlpha.StandardGain,
        selected,
        glow: pulse
          ? {
              intensity: markerPulseIntensity(style.zoomLevel),
              pulseIndex: pulse.index,
              id: entityId,
              config: pulse.glow,
            }
          : null,
        shape: (radius) => {
          const context = style.context;
          context.beginPath();
          context.moveTo(
            projection.x,
            projection.y - radius * WeatherMarkerGeometry.Vertical,
          );
          context.lineTo(
            projection.x +
              radius * WeatherMarkerGeometry.Horizontal,
            projection.y,
          );
          context.lineTo(
            projection.x,
            projection.y + radius * WeatherMarkerGeometry.Vertical,
          );
          context.lineTo(
            projection.x -
              radius * WeatherMarkerGeometry.Horizontal,
            projection.y,
          );
          context.closePath();
        },
      });
    }
    style.context.globalAlpha = 1;
  }

  protected includes(
    view: RenderSceneView,
    index: number,
    filter: WeatherSceneFilter,
  ): boolean {
    return weatherSceneIncludes(view, index, filter);
  }
}

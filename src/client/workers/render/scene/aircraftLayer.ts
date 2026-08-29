import type { AircraftFilterValues } from "@shared/domain/aircraftFilter";
import {
  AIRCRAFT_SCENE_SQUAWK_CODES,
  AircraftSceneAttribute,
  AircraftSceneFlag,
  AircraftSceneStringAttribute,
} from "@shared/scene";
import type { RenderSceneView } from "@/workers/render/sceneStore";
import type { SceneProjection } from "@/workers/render/scene/projectedLayer";
import {
  RenderLayerOrder,
  ScenePointLayer,
} from "@/workers/render/scene/sceneLayer";
import {
  sceneSourceIncludes,
  type SceneVisibilitySettings,
} from "@/workers/render/scene/visibility";
import {
  movingPositionAccessor,
} from "@/workers/render/scene/movingScenePosition";
import { drawSelectionRing } from "@/workers/render/primitives/selectionRing";
import { Domain } from "@shared/domain/identity";
import {
  MilFilter,
  SquawkBucket,
  SquawkStatus,
} from "@shared/domain/aircraft";
import { TurnDeg } from "@shared/geo";

enum AircraftMarkerSize {
  Maximum = 4,
  ZoomGain = 0.5,
  MilitaryMaximum = 5,
  SpecialScale = 1.2,
  ReconMinimum = 2.2,
  SelectedScale = 2,
}

enum AircraftMarkerAlpha {
  Maximum = 0.8,
  Base = 0.2,
  ZoomDivisor = 5,
  ZoomGain = 0.6,
  MilitaryMaximum = 0.9,
  MilitaryGain = 0.15,
  ReconMinimum = 0.75,
  ReconGain = 0.1,
}

enum AircraftMarkerGeometry {
  TipScale = 1.6,
  WingAngleRadians = 2.4,
}

export type AircraftSceneFilter = SceneVisibilitySettings &
  Readonly<{ filter: AircraftFilterValues }>;

export type AircraftSceneStyle = Readonly<{
  context: OffscreenCanvasRenderingContext2D;
  baseColor: string;
  emergencyColor: string;
  hijackColor: string;
  militaryColor: string;
  radioFailureColor: string;
  reconColor: string;
  selectedId: string | null;
  time: number;
  zoomLevel: number;
}>;

function numericAttribute(
  view: RenderSceneView,
  index: number,
  offset: number,
): number {
  return view.attributes[index * view.attributeStride + offset] ?? 0;
}

function flagsAt(view: RenderSceneView, index: number): number {
  return numericAttribute(
    view,
    index,
    AircraftSceneAttribute.Flags,
  );
}

function hasFlag(flags: number, flag: number): boolean {
  return (flags & flag) === flag;
}

function countryAt(view: RenderSceneView, index: number): string {
  const offset =
    index * view.stringAttributeStride +
    AircraftSceneStringAttribute.Country;
  const dictionaryIndex = view.stringAttributes[offset] ?? 0;
  if (dictionaryIndex === 0) return "";
  return view.dictionary[dictionaryIndex - 1] ?? "";
}

function squawkBucketAt(
  view: RenderSceneView,
  index: number,
): SquawkBucket {
  const code = numericAttribute(
    view,
    index,
    AircraftSceneAttribute.Squawk,
  );
  if (code === AIRCRAFT_SCENE_SQUAWK_CODES[SquawkStatus.Emergency]) {
    return SquawkBucket.Emergency;
  }
  if (
    code ===
    AIRCRAFT_SCENE_SQUAWK_CODES[SquawkStatus.RadioFailure]
  ) {
    return SquawkBucket.RadioFailure;
  }
  if (code === AIRCRAFT_SCENE_SQUAWK_CODES[SquawkStatus.Hijack]) {
    return SquawkBucket.Hijack;
  }
  return SquawkBucket.Other;
}

export function aircraftSceneIncludes(
  view: RenderSceneView,
  index: number,
  settings: AircraftSceneFilter,
): boolean {
  if (
    !sceneSourceIncludes(Domain.Aircraft, view, index, {
      ...settings,
      enabled: settings.filter.enabled,
    })
  ) {
    return false;
  }

  const flags = flagsAt(view, index);
  const onGround = hasFlag(flags, AircraftSceneFlag.OnGround);
  const military = hasFlag(
    flags,
    AircraftSceneFlag.Military,
  );
  const recon = hasFlag(flags, AircraftSceneFlag.Recon);

  if (!settings.filter.showAirborne && !onGround) return false;
  if (!settings.filter.showGround && onGround) return false;
  if (
    settings.filter.milFilter === MilFilter.Military &&
    !military
  ) {
    return false;
  }
  if (
    settings.filter.milFilter === MilFilter.Civilian &&
    military
  ) {
    return false;
  }
  if (settings.filter.milFilter === MilFilter.Recon && !recon) {
    return false;
  }
  if (
    settings.filter.squawks.length > 0 &&
    !settings.filter.squawks.includes(
      squawkBucketAt(view, index),
    )
  ) {
    return false;
  }
  return (
    settings.filter.countries.length === 0 ||
    settings.filter.countries.includes(countryAt(view, index))
  );
}

function markerColor(
  flags: number,
  squawk: number,
  style: AircraftSceneStyle,
): string {
  if (
    squawk === AIRCRAFT_SCENE_SQUAWK_CODES[SquawkStatus.Emergency]
  ) {
    return style.emergencyColor;
  }
  if (
    squawk ===
    AIRCRAFT_SCENE_SQUAWK_CODES[SquawkStatus.RadioFailure]
  ) {
    return style.radioFailureColor;
  }
  if (squawk === AIRCRAFT_SCENE_SQUAWK_CODES[SquawkStatus.Hijack]) {
    return style.hijackColor;
  }
  if (hasFlag(flags, AircraftSceneFlag.Recon)) {
    return style.reconColor;
  }
  if (hasFlag(flags, AircraftSceneFlag.Military)) {
    return style.militaryColor;
  }
  return style.baseColor;
}

function markerSize(
  flags: number,
  selected: boolean,
  zoomLevel: number,
): number {
  const military = hasFlag(
    flags,
    AircraftSceneFlag.Military,
  );
  const recon = hasFlag(flags, AircraftSceneFlag.Recon);
  let size = Math.min(
    AircraftMarkerSize.Maximum,
    1 + Math.max(0, (zoomLevel - 1) * AircraftMarkerSize.ZoomGain),
  );
  if (military) {
    size = Math.min(
      AircraftMarkerSize.MilitaryMaximum,
      size * AircraftMarkerSize.SpecialScale,
    );
  }
  if (recon) {
    size =
      Math.max(size, AircraftMarkerSize.ReconMinimum) *
      AircraftMarkerSize.SpecialScale;
  }
  return selected ? size * AircraftMarkerSize.SelectedScale : size;
}

function markerAlpha(flags: number, zoomLevel: number): number {
  const military = hasFlag(
    flags,
    AircraftSceneFlag.Military,
  );
  const recon = hasFlag(flags, AircraftSceneFlag.Recon);
  let alpha = Math.min(
    AircraftMarkerAlpha.Maximum,
    AircraftMarkerAlpha.Base +
      Math.max(
        0,
        (zoomLevel - 1) / AircraftMarkerAlpha.ZoomDivisor,
      ) *
        AircraftMarkerAlpha.ZoomGain,
  );
  if (military) {
    alpha = Math.min(
      AircraftMarkerAlpha.MilitaryMaximum,
      alpha + AircraftMarkerAlpha.MilitaryGain,
    );
  }
  if (recon) {
    alpha = Math.min(
      1,
      Math.max(alpha, AircraftMarkerAlpha.ReconMinimum) +
        AircraftMarkerAlpha.ReconGain,
    );
  }
  return alpha;
}

function drawMarker(
  view: RenderSceneView,
  projection: SceneProjection | null,
  index: number,
  style: AircraftSceneStyle,
): void {
  if (!projection) return;
  const entityId = view.entityIds[index];
  if (!entityId) return;

  const attributeOffset = index * view.attributeStride;
  const heading =
    view.attributes[
      attributeOffset + AircraftSceneAttribute.Heading
    ] ?? 0;
  const flags =
    view.attributes[
      attributeOffset + AircraftSceneAttribute.Flags
    ] ?? 0;
  const squawk =
    view.attributes[
      attributeOffset + AircraftSceneAttribute.Squawk
    ] ?? 0;
  const selected = entityId === style.selectedId;
  const size = markerSize(flags, selected, style.zoomLevel);
  const color = markerColor(flags, squawk, style);
  const emergency =
    squawk !== AIRCRAFT_SCENE_SQUAWK_CODES[SquawkStatus.Normal];
  const angle = (heading * Math.PI) / TurnDeg.Half;
  const context = style.context;

  context.globalAlpha = emergency
    ? projection.depth
    : projection.depth * markerAlpha(flags, style.zoomLevel);
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(
    projection.x +
      Math.sin(angle) * size * AircraftMarkerGeometry.TipScale,
    projection.y -
      Math.cos(angle) * size * AircraftMarkerGeometry.TipScale,
  );
  context.lineTo(
    projection.x +
      Math.sin(angle + AircraftMarkerGeometry.WingAngleRadians) *
        size,
    projection.y -
      Math.cos(angle + AircraftMarkerGeometry.WingAngleRadians) *
        size,
  );
  context.lineTo(
    projection.x +
      Math.sin(angle - AircraftMarkerGeometry.WingAngleRadians) *
        size,
    projection.y -
      Math.cos(angle - AircraftMarkerGeometry.WingAngleRadians) *
        size,
  );
  context.closePath();
  context.fill();
  if (selected) {
    drawSelectionRing(
      context,
      projection.x,
      projection.y,
      size,
      color,
      style.time,
    );
  }
}

export class AircraftLayer extends ScenePointLayer<
  AircraftSceneFilter,
  AircraftSceneStyle
> {
  readonly order = RenderLayerOrder.Aircraft;

  constructor() {
    super(Domain.Aircraft, movingPositionAccessor(Domain.Aircraft));
  }

  protected includes(
    view: RenderSceneView,
    index: number,
    filter: AircraftSceneFilter,
  ): boolean {
    return aircraftSceneIncludes(view, index, filter);
  }

  protected drawRecord(
    view: RenderSceneView,
    index: number,
    style: AircraftSceneStyle,
  ): void {
    drawMarker(
      view,
      this.projection.projection(index),
      index,
      style,
    );
  }
}

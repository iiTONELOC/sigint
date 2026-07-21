import type { Ctx } from "@/features/environmental/cyclones/render/cycloneGeometry";
import type { RenderAircraftFilter } from "@/workers/render/protocol";
import {
  AIRCRAFT_SCENE,
  type AircraftSquawkBucket,
} from "@/workers/render/scene/aircraftSchema";
import type { ProjectedSceneLayer } from "@/workers/render/scene/projectedLayer";
import type { RenderSceneView } from "@/workers/render/sceneStore";
import {
  sceneRecordIsVisible,
  type SceneVisibilitySettings,
} from "@/workers/render/scene/visibility";
import { drawSelectionRing } from "@/workers/render/primitives/selectionRing";
import { zoomScale } from "@/workers/render/workerMath";

export type AircraftSceneFilter = SceneVisibilitySettings &
  Readonly<{ filter: RenderAircraftFilter }>;

export type AircraftSceneStyle = Readonly<{
  context: Ctx;
  baseColor: string;
  militaryColor: string;
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
    AIRCRAFT_SCENE.attributes.flags,
  );
}

function hasFlag(flags: number, flag: number): boolean {
  return (flags & flag) === flag;
}

function countryAt(view: RenderSceneView, index: number): string {
  const offset =
    index * view.stringAttributeStride +
    AIRCRAFT_SCENE.stringAttributes.country;
  const dictionaryIndex = view.stringAttributes[offset] ?? 0;
  if (dictionaryIndex === 0) return "";
  return view.dictionary[dictionaryIndex - 1] ?? "";
}

function squawkBucketAt(
  view: RenderSceneView,
  index: number,
): AircraftSquawkBucket {
  const code = numericAttribute(
    view,
    index,
    AIRCRAFT_SCENE.attributes.squawk,
  );
  if (code === AIRCRAFT_SCENE.squawks.emergency) return "7700";
  if (code === AIRCRAFT_SCENE.squawks.radioFailure) return "7600";
  if (code === AIRCRAFT_SCENE.squawks.hijack) return "7500";
  return "other";
}

function hasCompatibleSchema(view: RenderSceneView): boolean {
  return (
    view.attributeStride === AIRCRAFT_SCENE.attributeStride &&
    view.stringAttributeStride ===
      AIRCRAFT_SCENE.stringAttributeStride
  );
}

export function aircraftSceneIncludes(
  view: RenderSceneView,
  index: number,
  settings: AircraftSceneFilter,
): boolean {
  if (
    !hasCompatibleSchema(view) ||
    !sceneRecordIsVisible(
      view,
      index,
      "aircraft",
      settings.filter.enabled,
      settings,
    )
  ) {
    return false;
  }

  const flags = flagsAt(view, index);
  const onGround = hasFlag(flags, AIRCRAFT_SCENE.flags.onGround);
  const military = hasFlag(
    flags,
    AIRCRAFT_SCENE.flags.military,
  );
  const recon = hasFlag(flags, AIRCRAFT_SCENE.flags.recon);

  if (!settings.filter.showAirborne && !onGround) return false;
  if (!settings.filter.showGround && onGround) return false;
  if (
    settings.filter.milFilter === "military" &&
    !military
  ) {
    return false;
  }
  if (
    settings.filter.milFilter === "civilian" &&
    military
  ) {
    return false;
  }
  if (settings.filter.milFilter === "recon" && !recon) {
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
  if (squawk === AIRCRAFT_SCENE.squawks.emergency) {
    return "#ff3333";
  }
  if (squawk === AIRCRAFT_SCENE.squawks.radioFailure) {
    return "#ff8800";
  }
  if (squawk === AIRCRAFT_SCENE.squawks.hijack) {
    return "#cc44ff";
  }
  if (hasFlag(flags, AIRCRAFT_SCENE.flags.recon)) {
    return style.reconColor;
  }
  if (hasFlag(flags, AIRCRAFT_SCENE.flags.military)) {
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
    AIRCRAFT_SCENE.flags.military,
  );
  const recon = hasFlag(flags, AIRCRAFT_SCENE.flags.recon);
  let size = Math.min(
    4,
    1 + Math.max(0, (zoomLevel - 1) * 0.5),
  );
  if (military) size = Math.min(5, size * 1.2);
  if (recon) size = Math.max(size, 2.2) * 1.2;
  return selected ? size * 2 : size;
}

function markerAlpha(flags: number, zoomLevel: number): number {
  const military = hasFlag(
    flags,
    AIRCRAFT_SCENE.flags.military,
  );
  const recon = hasFlag(flags, AIRCRAFT_SCENE.flags.recon);
  let alpha = Math.min(
    0.8,
    0.2 + Math.max(0, (zoomLevel - 1) / 5) * 0.6,
  );
  if (military) alpha = Math.min(0.9, alpha + 0.15);
  if (recon) alpha = Math.min(1, Math.max(alpha, 0.75) + 0.1);
  return alpha;
}

function drawMarker(
  view: RenderSceneView,
  projection: ReturnType<ProjectedSceneLayer["projection"]>,
  index: number,
  style: AircraftSceneStyle,
): void {
  if (!projection) return;
  const id = view.ids[index];
  if (!id) return;

  const attributeOffset = index * view.attributeStride;
  const heading =
    view.attributes[
      attributeOffset + AIRCRAFT_SCENE.attributes.heading
    ] ?? 0;
  const flags =
    view.attributes[
      attributeOffset + AIRCRAFT_SCENE.attributes.flags
    ] ?? 0;
  const squawk =
    view.attributes[
      attributeOffset + AIRCRAFT_SCENE.attributes.squawk
    ] ?? 0;
  const selected = id === style.selectedId;
  const size = markerSize(flags, selected, style.zoomLevel);
  const color = markerColor(flags, squawk, style);
  const emergency = squawk !== AIRCRAFT_SCENE.squawks.normal;
  const angle = (heading * Math.PI) / 180;
  const context = style.context;

  context.globalAlpha = emergency
    ? projection.depth
    : projection.depth * markerAlpha(flags, style.zoomLevel);
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(
    projection.x + Math.sin(angle) * size * 1.6,
    projection.y - Math.cos(angle) * size * 1.6,
  );
  context.lineTo(
    projection.x + Math.sin(angle + 2.4) * size,
    projection.y - Math.cos(angle + 2.4) * size,
  );
  context.lineTo(
    projection.x + Math.sin(angle - 2.4) * size,
    projection.y - Math.cos(angle - 2.4) * size,
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

export function drawAircraftScene(
  view: RenderSceneView,
  layer: ProjectedSceneLayer,
  style: AircraftSceneStyle,
): void {
  for (const index of layer.visibleIndices()) {
    drawMarker(view, layer.projection(index), index, style);
  }
  style.context.globalAlpha = 1;
}

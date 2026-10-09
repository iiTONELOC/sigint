import { estimatedCyclonePosition, type CycloneFix } from "@shared/domain/cyclones";
import { CycloneSceneAttribute, CycloneSceneRole } from "@shared/scene";
import { geographicToUnitVector } from "@/lib/geo/unitSphere";
import {
  scenePositionFromRecord,
  scenePositionFromView,
  type ScenePositionAccessor,
  type SceneResolvedPosition,
} from "@/workers/render/scene/scenePosition";
import {
  sceneNumericAttribute,
  type RenderSceneRecord,
  type RenderSceneView,
} from "@/workers/render/sceneStore";

function resolvedAt(latitude: number, longitude: number): SceneResolvedPosition {
  const unit = geographicToUnitVector(latitude, longitude);
  return { latitude, longitude, unitX: unit.x, unitY: unit.y, unitZ: unit.z, interpolated: true };
}

function forecastFixes(view: RenderSceneView): Map<string, CycloneFix[]> {
  const fixes = new Map<string, CycloneFix[]>();
  for (let index = 0; index < view.capacity; index++) {
    if (view.active[index] !== 1) continue;
    if (sceneNumericAttribute(view, index, CycloneSceneAttribute.Role) !== CycloneSceneRole.Forecast) continue;
    const entityId = view.entityIds[index];
    const position = scenePositionFromView(view, index);
    const timeMs = view.timestamps[index];
    if (!entityId || !position || timeMs === undefined) continue;
    const entityFixes = fixes.get(entityId) ?? [];
    entityFixes.push({ position: [position.longitude, position.latitude], timeMs });
    fixes.set(entityId, entityFixes);
  }
  return fixes;
}

export class CycloneScenePositionAccessor implements ScenePositionAccessor {
  private readonly fixesByView = new WeakMap<RenderSceneView, Map<string, CycloneFix[]>>();
  private readonly estimates = new Map<string, SceneResolvedPosition>();

  resolveView(view: RenderSceneView, index: number, time: number): SceneResolvedPosition | null {
    const raw = scenePositionFromView(view, index);
    const entityId = view.entityIds[index];
    const timeMs = view.timestamps[index];
    if (!raw || !entityId || timeMs === undefined) return raw;
    if (sceneNumericAttribute(view, index, CycloneSceneAttribute.Role) !== CycloneSceneRole.Current) return raw;
    const [longitude, latitude] = estimatedCyclonePosition(
      { position: [raw.longitude, raw.latitude], timeMs },
      this.fixes(view).get(entityId) ?? [],
      time,
    );
    const estimate = resolvedAt(latitude, longitude);
    this.estimates.set(entityId, estimate);
    return estimate;
  }

  resolveRecord(record: RenderSceneRecord, _time: number): SceneResolvedPosition {
    const current = record.attributes[CycloneSceneAttribute.Role] === CycloneSceneRole.Current;
    return (current ? this.estimates.get(record.entityId) : undefined) ?? scenePositionFromRecord(record);
  }

  hasFrameMotion(_view: RenderSceneView): boolean {
    return false;
  }

  hasMotionAt(_view: RenderSceneView, _index: number): boolean {
    return false;
  }

  private fixes(view: RenderSceneView): Map<string, CycloneFix[]> {
    let fixes = this.fixesByView.get(view);
    if (!fixes) {
      fixes = forecastFixes(view);
      this.fixesByView.set(view, fixes);
    }
    return fixes;
  }
}

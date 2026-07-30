import {
  fireConfidenceLevel,
  type FirePoint,
} from "@/features/environmental/fires/data/source";
import { geographicToUnitVector } from "@/lib/geo/unitSphere";
import {
  RenderDataLaneComponentCount,
  type PackedFireRenderData,
} from "@/workers/render/dataChannel";

export function packFireRenderData(
  points: readonly FirePoint[],
): PackedFireRenderData {
  const count = points.length;
  const ids = new Array<string>(count);
  const positions = new Float64Array(
    count * RenderDataLaneComponentCount.Position,
  );
  const unitVectors = new Float32Array(
    count * RenderDataLaneComponentCount.UnitVector,
  );
  const frp = new Float32Array(count);
  const timestamps = new Float64Array(count);
  const confidences = new Uint8Array(count);

  for (let index = 0; index < count; index++) {
    const point = points[index];
    if (!point) continue;
    ids[index] = point.id;
    const positionOffset =
      index * RenderDataLaneComponentCount.Position;
    positions[positionOffset] = point.lon;
    positions[positionOffset + 1] = point.lat;
    const unit = geographicToUnitVector(point.lat, point.lon);
    const vectorOffset =
      index * RenderDataLaneComponentCount.UnitVector;
    unitVectors[vectorOffset] = unit.x;
    unitVectors[vectorOffset + 1] = unit.y;
    unitVectors[vectorOffset + 2] = unit.z;
    frp[index] = point.data.frp ?? 0;
    const timestamp = point.timestamp ? Date.parse(point.timestamp) : 0;
    timestamps[index] = Number.isFinite(timestamp) ? timestamp : 0;
    confidences[index] = fireConfidenceLevel(point.data.confidence);
  }

  return {
    ids,
    positions,
    unitVectors,
    frp,
    timestamps,
    confidences,
  };
}

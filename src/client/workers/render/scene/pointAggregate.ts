// One marker per 1 degree cell for dense stationary layers at low zoom.
// Built once per scene version; the aggregate is itself a scene view, so
// the shared projection, culling, and batching apply to it unchanged.

import { geographicToUnitVector } from "@/lib/geo/unitSphere";
import type { RenderSceneView } from "@/workers/render/sceneStore";
import { GeoLimit } from "@shared/geo";
import { SCENE_POSITION_COUNT, ScenePositionOffset } from "@shared/scene";

export enum AggregateCell {
  SizeDegrees = 0.5,
  Columns = 720,
}

/** Attribute lanes of an aggregate view. */
export enum AggregateAttribute {
  PeakMetric = 0,
  Count = 1,
}

export const AGGREGATE_ATTRIBUTE_COUNT = AggregateAttribute.Count + 1;

type CellSum = {
  count: number;
  latestTimestamp: number;
  latitudeSum: number;
  longitudeSum: number;
  peakMetric: number;
  peakIndex: number;
  records: number[];
};

export type PointAggregate = Readonly<{
  view: RenderSceneView;
  /** Record indices behind each aggregate index. */
  records: readonly (readonly number[])[];
  /** The strongest record in each cell, for hits. */
  peakRecords: readonly number[];
  cellOfEntity: ReadonlyMap<string, number>;
}>;

function cellKey(latitude: number, longitude: number): number {
  const row = Math.floor((latitude - GeoLimit.MinLatitude) / AggregateCell.SizeDegrees);
  const column = Math.floor((longitude - GeoLimit.MinLongitude) / AggregateCell.SizeDegrees);
  return row * AggregateCell.Columns + column;
}

function accumulate(
  sums: Map<number, CellSum>,
  view: RenderSceneView,
  index: number,
  metric: number,
): void {
  const offset = index * SCENE_POSITION_COUNT;
  const longitude = view.positions[offset + ScenePositionOffset.Longitude];
  const latitude = view.positions[offset + ScenePositionOffset.Latitude];
  if (longitude === undefined || latitude === undefined) return;
  const key = cellKey(latitude, longitude);
  let sum = sums.get(key);
  if (!sum) {
    sum = {
      count: 0,
      latestTimestamp: 0,
      latitudeSum: 0,
      longitudeSum: 0,
      peakMetric: Number.NEGATIVE_INFINITY,
      peakIndex: index,
      records: [],
    };
    sums.set(key, sum);
  }
  sum.count += 1;
  sum.latitudeSum += latitude;
  sum.longitudeSum += longitude;
  sum.latestTimestamp = Math.max(sum.latestTimestamp, view.timestamps[index] ?? 0);
  if (metric > sum.peakMetric) {
    sum.peakMetric = metric;
    sum.peakIndex = index;
  }
  sum.records.push(index);
}

function aggregateView(sums: readonly CellSum[]): RenderSceneView {
  const capacity = sums.length;
  const positions = new Float64Array(capacity * SCENE_POSITION_COUNT);
  const unitVectors = new Float32Array(capacity * 3);
  const timestamps = new Float64Array(capacity);
  const attributes = new Float32Array(capacity * AGGREGATE_ATTRIBUTE_COUNT);
  const ids: string[] = [];
  for (const [index, sum] of sums.entries()) {
    const latitude = sum.latitudeSum / sum.count;
    const longitude = sum.longitudeSum / sum.count;
    positions[index * SCENE_POSITION_COUNT + ScenePositionOffset.Longitude] = longitude;
    positions[index * SCENE_POSITION_COUNT + ScenePositionOffset.Latitude] = latitude;
    const unit = geographicToUnitVector(latitude, longitude);
    unitVectors[index * 3] = unit.x;
    unitVectors[index * 3 + 1] = unit.y;
    unitVectors[index * 3 + 2] = unit.z;
    timestamps[index] = sum.latestTimestamp;
    attributes[index * AGGREGATE_ATTRIBUTE_COUNT + AggregateAttribute.PeakMetric] = sum.peakMetric;
    attributes[index * AGGREGATE_ATTRIBUTE_COUNT + AggregateAttribute.Count] = sum.count;
    ids.push(`cell:${index}`);
  }
  return {
    capacity,
    active: new Uint8Array(capacity).fill(1),
    sceneIds: ids,
    entityIds: ids,
    positions,
    motionPositions: new Float64Array(),
    motionPositionStride: 0,
    unitVectors,
    timestamps,
    attributes,
    attributeStride: AGGREGATE_ATTRIBUTE_COUNT,
    stringAttributes: new Uint32Array(),
    stringAttributeStride: 0,
    dictionary: [],
    geometries: [],
  };
}

/** Fold every active record into its 1 degree cell. */
export function aggregatePoints(
  view: RenderSceneView,
  metricAt: (index: number) => number,
): PointAggregate {
  const sums = new Map<number, CellSum>();
  for (let index = 0; index < view.capacity; index++) {
    if (view.active[index] === 1) accumulate(sums, view, index, metricAt(index));
  }
  const cells = [...sums.values()];
  const cellOfEntity = new Map<string, number>();
  for (const [cell, sum] of cells.entries()) {
    for (const index of sum.records) {
      const entityId = view.entityIds[index];
      if (entityId) cellOfEntity.set(entityId, cell);
    }
  }
  return {
    view: aggregateView(cells),
    records: cells.map((sum) => sum.records),
    peakRecords: cells.map((sum) => sum.peakIndex),
    cellOfEntity,
  };
}

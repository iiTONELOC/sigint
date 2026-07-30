import type { GlobeRotationMatrix } from "@/lib/geo/unitSphere";
import type { RenderSceneView } from "@/workers/render/sceneStore";
import { TurnDeg } from "@shared/geo";

enum SceneLaneComponentCount {
  Pair = 2,
  Triple = 3,
}

enum ProjectionOffset {
  X = 0,
  Y = 1,
  Depth = 2,
}

enum PositionOffset {
  Longitude = 0,
  Latitude = 1,
}

enum UnitVectorOffset {
  X = 0,
  Y = 1,
  Z = 2,
}

enum HitCellOffset {
  Previous = -1,
  Next = 1,
}

enum ProjectionScale {
  Half = 2,
}

export type FlatSceneProjection = Readonly<{
  centerX: number;
  centerY: number;
  mapWidth: number;
  mapHeight: number;
}>;

export type GlobeSceneProjection = Readonly<{
  matrix: GlobeRotationMatrix;
  centerX: number;
  centerY: number;
  radius: number;
}>;

export type SceneProjectionFrame = Readonly<{
  width: number;
  height: number;
  hitCellSize: number;
  cullMargin: number;
  flat: FlatSceneProjection | null;
  globe: GlobeSceneProjection | null;
  includes: (index: number) => boolean;
}>;

export enum SceneHitKind {
  Point = "point",
  Area = "area",
}

export type SceneHit = Readonly<{
  kind: SceneHitKind;
  handle: number;
  sceneId: string;
  entityId: string;
  longitude: number;
  latitude: number;
  distance: number;
}>;

export type SceneProjection = Readonly<{
  x: number;
  y: number;
  depth: number;
}>;

export class ProjectedSceneLayer {
  private cells = new Map<number, number[]>();
  private columns = 0;
  private hitCellSize = 1;
  private projected = new Float32Array(0);
  private rows = 0;
  private view: RenderSceneView | null = null;
  private visible: number[] = [];

  project(view: RenderSceneView, frame: SceneProjectionFrame): void {
    this.view = view;
    this.ensureProjectionCapacity(view.capacity);
    this.clearProjection();
    this.prepareHitGrid(frame);

    for (const [index, active] of view.active.entries()) {
      if (active !== 1 || !frame.includes(index)) continue;
      const projection = this.projectRecord(view, frame, index);
      if (!projection || !this.isInsideFrame(projection, frame)) continue;
      this.writeProjection(index, projection);
      this.visible.push(index);
      this.addHitCandidate(index, projection.x, projection.y);
    }
  }

  visibleIndices(): IterableIterator<number> {
    return this.visible.values();
  }

  projection(index: number): SceneProjection | null {
    const offset = index * SceneLaneComponentCount.Triple;
    const x = this.projected[offset + ProjectionOffset.X];
    const y = this.projected[offset + ProjectionOffset.Y];
    const depth = this.projected[offset + ProjectionOffset.Depth];
    if (
      x === undefined ||
      y === undefined ||
      depth === undefined ||
      depth <= 0
    ) {
      return null;
    }
    return { x, y, depth };
  }

  nearest(
    x: number,
    y: number,
    radius: number,
    maximumCandidates: number,
  ): SceneHit | null {
    if (!this.view || this.cells.size === 0) return null;
    let closest: SceneHit | null = null;
    let closestDistance = radius;
    let inspected = 0;

    for (const index of this.nearbyCandidateIndices(x, y)) {
      if (inspected >= maximumCandidates) break;
      inspected += 1;
      const candidate = this.hitForIndex(index, x, y);
      if (!candidate || candidate.distance >= closestDistance) continue;
      closest = candidate;
      closestDistance = candidate.distance;
    }
    return closest;
  }

  private ensureProjectionCapacity(capacity: number): void {
    const required = capacity * SceneLaneComponentCount.Triple;
    if (this.projected.length >= required) return;
    this.projected = new Float32Array(required);
  }

  private clearProjection(): void {
    for (const index of this.visible) {
      const offset =
        index * SceneLaneComponentCount.Triple + ProjectionOffset.Depth;
      this.projected[offset] = -1;
    }
    this.visible = [];
    this.cells = new Map();
  }

  private prepareHitGrid(frame: SceneProjectionFrame): void {
    this.hitCellSize = Math.max(1, frame.hitCellSize);
    this.columns = Math.max(
      1,
      Math.ceil(frame.width / this.hitCellSize),
    );
    this.rows = Math.max(
      1,
      Math.ceil(frame.height / this.hitCellSize),
    );
  }

  private projectRecord(
    view: RenderSceneView,
    frame: SceneProjectionFrame,
    index: number,
  ): SceneProjection | null {
    const positionOffset = index * SceneLaneComponentCount.Pair;
    const longitude =
      view.positions[positionOffset + PositionOffset.Longitude];
    const latitude =
      view.positions[positionOffset + PositionOffset.Latitude];
    if (longitude === undefined || latitude === undefined) return null;
    if (frame.flat) return this.projectFlat(frame.flat, longitude, latitude);
    return frame.globe
      ? this.projectGlobe(view, frame.globe, index)
      : null;
  }

  private projectFlat(
    flat: FlatSceneProjection,
    longitude: number,
    latitude: number,
  ): SceneProjection {
    return {
      x:
        flat.centerX +
        (longitude / TurnDeg.Half) *
          (flat.mapWidth / ProjectionScale.Half),
      y:
        flat.centerY -
        (latitude / TurnDeg.Quarter) *
          (flat.mapHeight / ProjectionScale.Half),
      depth: 1,
    };
  }

  private projectGlobe(
    view: RenderSceneView,
    globe: GlobeSceneProjection,
    index: number,
  ): SceneProjection | null {
    const unitOffset = index * SceneLaneComponentCount.Triple;
    const unitX = view.unitVectors[unitOffset + UnitVectorOffset.X];
    const unitY = view.unitVectors[unitOffset + UnitVectorOffset.Y];
    const unitZ = view.unitVectors[unitOffset + UnitVectorOffset.Z];
    if (
      unitX === undefined ||
      unitY === undefined ||
      unitZ === undefined
    ) {
      return null;
    }

    const matrix = globe.matrix;
    const rotatedX =
      matrix.m00 * unitX + matrix.m01 * unitY + matrix.m02 * unitZ;
    const rotatedY =
      matrix.m10 * unitX + matrix.m11 * unitY + matrix.m12 * unitZ;
    const depth =
      matrix.m20 * unitX + matrix.m21 * unitY + matrix.m22 * unitZ;
    if (depth <= 0) return null;
    return {
      x: globe.centerX + rotatedX * globe.radius,
      y: globe.centerY - rotatedY * globe.radius,
      depth,
    };
  }

  private isInsideFrame(
    projection: SceneProjection,
    frame: SceneProjectionFrame,
  ): boolean {
    return (
      projection.x >= -frame.cullMargin &&
      projection.y >= -frame.cullMargin &&
      projection.x < frame.width + frame.cullMargin &&
      projection.y < frame.height + frame.cullMargin
    );
  }

  private writeProjection(
    index: number,
    projection: SceneProjection,
  ): void {
    const offset = index * SceneLaneComponentCount.Triple;
    this.projected[offset + ProjectionOffset.X] = projection.x;
    this.projected[offset + ProjectionOffset.Y] = projection.y;
    this.projected[offset + ProjectionOffset.Depth] = projection.depth;
  }

  private addHitCandidate(index: number, x: number, y: number): void {
    const column = Math.floor(x / this.hitCellSize);
    const row = Math.floor(y / this.hitCellSize);
    if (
      column < 0 ||
      row < 0 ||
      column >= this.columns ||
      row >= this.rows
    ) {
      return;
    }
    const cell = row * this.columns + column;
    const bucket = this.cells.get(cell) ?? [];
    if (!this.cells.has(cell)) this.cells.set(cell, bucket);
    bucket.push(index);
  }

  private *nearbyCandidateIndices(
    x: number,
    y: number,
  ): IterableIterator<number> {
    const centerColumn = Math.floor(x / this.hitCellSize);
    const centerRow = Math.floor(y / this.hitCellSize);
    for (
      let rowOffset = HitCellOffset.Previous;
      rowOffset <= HitCellOffset.Next;
      rowOffset += 1
    ) {
      const row = centerRow + rowOffset;
      if (row < 0 || row >= this.rows) continue;
      yield* this.rowCandidates(centerColumn, row);
    }
  }

  private *rowCandidates(
    centerColumn: number,
    row: number,
  ): IterableIterator<number> {
    for (
      let columnOffset = HitCellOffset.Previous;
      columnOffset <= HitCellOffset.Next;
      columnOffset += 1
    ) {
      const column = centerColumn + columnOffset;
      if (column < 0 || column >= this.columns) continue;
      yield* (this.cells.get(row * this.columns + column) ?? []);
    }
  }

  private hitForIndex(index: number, x: number, y: number): SceneHit | null {
    const view = this.view;
    if (!view) return null;
    const projection = this.projection(index);
    const sceneId = view.sceneIds[index];
    const entityId = view.entityIds[index];
    const positionOffset = index * SceneLaneComponentCount.Pair;
    const longitude =
      view.positions[positionOffset + PositionOffset.Longitude];
    const latitude =
      view.positions[positionOffset + PositionOffset.Latitude];
    if (
      !projection ||
      !sceneId ||
      !entityId ||
      longitude === undefined ||
      latitude === undefined
    ) {
      return null;
    }
    return {
      kind: SceneHitKind.Point,
      handle: index + 1,
      sceneId,
      entityId,
      longitude,
      latitude,
      distance: Math.hypot(projection.x - x, projection.y - y),
    };
  }
}

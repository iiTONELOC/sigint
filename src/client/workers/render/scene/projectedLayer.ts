import type { GlobeRotationMatrix } from "@/lib/geo/unitSphere";
import type { RenderSceneView } from "@/workers/render/sceneStore";

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

export type SceneHit = Readonly<{
  handle: number;
  id: string;
  longitude: number;
  latitude: number;
  distance: number;
}>;

export type SceneProjection = Readonly<{
  x: number;
  y: number;
  depth: number;
}>;

export type ProjectedSceneLayer = Readonly<{
  project: (
    view: RenderSceneView,
    frame: SceneProjectionFrame,
  ) => void;
  visibleIndices: () => IterableIterator<number>;
  projection: (index: number) => SceneProjection | null;
  nearest: (
    x: number,
    y: number,
    radius: number,
    maximumCandidates: number,
  ) => SceneHit | null;
}>;

const CELL_OFFSETS = [-1, 0, 1] as const;

export function createProjectedSceneLayer(): ProjectedSceneLayer {
  let view: RenderSceneView | null = null;
  let projected = new Float32Array(0);
  let visible: number[] = [];
  let cells = new Map<number, number[]>();
  let columns = 0;
  let rows = 0;
  let hitCellSize = 1;

  const ensureProjectionCapacity = (capacity: number): void => {
    const required = capacity * 3;
    if (projected.length >= required) return;
    projected = new Float32Array(required);
  };

  const addHitCandidate = (
    index: number,
    x: number,
    y: number,
  ): void => {
    const column = Math.floor(x / hitCellSize);
    const row = Math.floor(y / hitCellSize);
    if (
      column < 0 ||
      row < 0 ||
      column >= columns ||
      row >= rows
    ) {
      return;
    }
    const cell = row * columns + column;
    const bucket = cells.get(cell) ?? [];
    if (!cells.has(cell)) cells.set(cell, bucket);
    bucket.push(index);
  };

  return {
    project(nextView, frame): void {
      view = nextView;
      ensureProjectionCapacity(nextView.capacity);
      for (const index of visible) {
        projected[index * 3 + 2] = -1;
      }
      visible = [];
      cells = new Map();
      hitCellSize = Math.max(1, frame.hitCellSize);
      columns = Math.max(1, Math.ceil(frame.width / hitCellSize));
      rows = Math.max(1, Math.ceil(frame.height / hitCellSize));

      for (const [index, active] of nextView.active.entries()) {
        if (active !== 1 || !frame.includes(index)) continue;
        const positionOffset = index * 2;
        const longitude = nextView.positions[positionOffset];
        const latitude = nextView.positions[positionOffset + 1];
        if (longitude === undefined || latitude === undefined) continue;

        let x: number;
        let y: number;
        let depth: number;
        if (frame.flat) {
          x =
            frame.flat.centerX +
            (longitude / 180) * (frame.flat.mapWidth / 2);
          y =
            frame.flat.centerY -
            (latitude / 90) * (frame.flat.mapHeight / 2);
          depth = 1;
        } else if (frame.globe) {
          const unitOffset = index * 3;
          const unitX = nextView.unitVectors[unitOffset];
          const unitY = nextView.unitVectors[unitOffset + 1];
          const unitZ = nextView.unitVectors[unitOffset + 2];
          if (
            unitX === undefined ||
            unitY === undefined ||
            unitZ === undefined
          ) {
            continue;
          }
          const matrix = frame.globe.matrix;
          const rotatedX =
            matrix.m00 * unitX +
            matrix.m01 * unitY +
            matrix.m02 * unitZ;
          const rotatedY =
            matrix.m10 * unitX +
            matrix.m11 * unitY +
            matrix.m12 * unitZ;
          depth =
            matrix.m20 * unitX +
            matrix.m21 * unitY +
            matrix.m22 * unitZ;
          if (depth <= 0) continue;
          x = frame.globe.centerX + rotatedX * frame.globe.radius;
          y = frame.globe.centerY - rotatedY * frame.globe.radius;
        } else {
          continue;
        }

        if (
          x < -frame.cullMargin ||
          y < -frame.cullMargin ||
          x >= frame.width + frame.cullMargin ||
          y >= frame.height + frame.cullMargin
        ) {
          continue;
        }

        const projectedOffset = index * 3;
        projected[projectedOffset] = x;
        projected[projectedOffset + 1] = y;
        projected[projectedOffset + 2] = depth;
        visible.push(index);
        addHitCandidate(index, x, y);
      }
    },

    visibleIndices(): IterableIterator<number> {
      return visible.values();
    },

    projection(index): SceneProjection | null {
      const offset = index * 3;
      const x = projected[offset];
      const y = projected[offset + 1];
      const depth = projected[offset + 2];
      if (
        x === undefined ||
        y === undefined ||
        depth === undefined ||
        depth <= 0
      ) {
        return null;
      }
      return { x, y, depth };
    },

    nearest(x, y, radius, maximumCandidates): SceneHit | null {
      if (!view || cells.size === 0) return null;
      const centerColumn = Math.floor(x / hitCellSize);
      const centerRow = Math.floor(y / hitCellSize);
      let closest: SceneHit | null = null;
      let closestDistance = radius;
      let inspected = 0;

      for (const rowOffset of CELL_OFFSETS) {
        const row = centerRow + rowOffset;
        if (row < 0 || row >= rows) continue;
        for (const columnOffset of CELL_OFFSETS) {
          const column = centerColumn + columnOffset;
          if (column < 0 || column >= columns) continue;
          const candidates = cells.get(row * columns + column) ?? [];
          for (const index of candidates) {
            if (inspected >= maximumCandidates) return closest;
            inspected += 1;
            const offset = index * 3;
            const projectedX = projected[offset];
            const projectedY = projected[offset + 1];
            const id = view.ids[index];
            const longitude = view.positions[index * 2];
            const latitude = view.positions[index * 2 + 1];
            if (
              projectedX === undefined ||
              projectedY === undefined ||
              !id ||
              longitude === undefined ||
              latitude === undefined
            ) {
              continue;
            }
            const distance = Math.hypot(
              projectedX - x,
              projectedY - y,
            );
            if (distance >= closestDistance) continue;
            closestDistance = distance;
            closest = {
              handle: index + 1,
              id,
              longitude,
              latitude,
              distance,
            };
          }
        }
      }
      return closest;
    },
  };
}

import {
  fillStrokePaths,
  projectedRingPath,
} from "@/lib/geo/render/polygon";
import type {
  HorizonCircle,
  ProjFn,
  Pt,
  RenderContext2D,
} from "@/lib/geo/render/types";
import type { GeoMultiPolygon } from "@shared/geo";

export type SceneAreaProjection = Readonly<{
  project: ProjFn;
  horizon: HorizonCircle | null;
}>;

export type ProjectedScenePolygon = readonly (readonly Pt[])[];

export function projectSceneGeometry(
  geometry: GeoMultiPolygon,
  projection: SceneAreaProjection,
): readonly ProjectedScenePolygon[] {
  const polygons: ProjectedScenePolygon[] = [];
  for (const polygon of geometry) {
    const paths = polygon.map((ring) => {
      const projected = ring.map((point) =>
        projection.project(point[1], point[0]),
      );
      return projectedRingPath(projected, projection.horizon);
    });
    if (paths[0]?.length) polygons.push(paths);
  }
  return polygons;
}

export function drawSceneGeometry(
  context: RenderContext2D,
  geometry: GeoMultiPolygon,
  projection: SceneAreaProjection,
  color: string,
  alpha: number,
): void {
  for (const polygon of projectSceneGeometry(geometry, projection)) {
    fillStrokePaths(context, polygon, color, color, alpha);
  }
}

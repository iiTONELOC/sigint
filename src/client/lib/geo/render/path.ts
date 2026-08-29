import type { GeoPoint } from "@shared/geo";
import type { ProjFn, RenderContext2D } from "./types";

/** Stroke a lon/lat polyline; the pen lifts where a point is behind the horizon. */
export function strokeGeoPath(
  context: RenderContext2D,
  project: ProjFn,
  points: Iterable<GeoPoint>,
): void {
  context.beginPath();
  let penDown = false;
  for (const [longitude, latitude] of points) {
    const point = project(latitude, longitude);
    if (point.z <= 0) {
      penDown = false;
      continue;
    }
    if (penDown) context.lineTo(point.x, point.y);
    else context.moveTo(point.x, point.y);
    penDown = true;
  }
  context.stroke();
}

/** Begin a path through pre-projected screen points; `close` joins the last to the first. */
export function tracePoints(
  context: RenderContext2D,
  points: readonly (readonly [number, number])[],
  close = false,
): void {
  context.beginPath();
  for (const [index, point] of points.entries()) {
    if (index === 0) context.moveTo(point[0], point[1]);
    else context.lineTo(point[0], point[1]);
  }
  if (close) context.closePath();
}

/** Stroke an open path through pre-projected screen points. */
export function strokePoints(
  context: RenderContext2D,
  points: readonly (readonly [number, number])[],
): void {
  tracePoints(context, points);
  context.stroke();
}

import type { Projected } from "@/lib/geo/render/types";
import { GeoLimit } from "@shared/geo";

export const FLAT_MAP_POLICY = Object.freeze({
  widthFraction: 0.92,
  heightFraction: 0.84,
  longitudeSpan: GeoLimit.MaxLongitude,
  latitudeSpan: GeoLimit.MaxLatitude,
});

export type FlatMetrics = Readonly<{
  mW: number;
  mH: number;
  mx: number;
  my: number;
  cx: number;
  cy: number;
}>;

export type FlatPan = {
  panX: number;
  panY: number;
};

function mapWidth(viewportWidth: number, zoom: number): number {
  return viewportWidth * FLAT_MAP_POLICY.widthFraction * zoom;
}

function mapHeight(viewportHeight: number, zoom: number): number {
  return viewportHeight * FLAT_MAP_POLICY.heightFraction * zoom;
}

export function getFlatMetrics(
  viewportWidth: number,
  viewportHeight: number,
  zoom: number,
  panX = 0,
  panY = 0,
): FlatMetrics {
  const mW = mapWidth(viewportWidth, zoom);
  const mH = mapHeight(viewportHeight, zoom);
  return {
    mW,
    mH,
    mx: (viewportWidth - mW) / 2 + panX,
    my: (viewportHeight - mH) / 2 + panY,
    cx: viewportWidth / 2 + panX,
    cy: viewportHeight / 2 + panY,
  };
}

export function clampFlatPan(
  cam: FlatPan & Readonly<{ zoomFlat: number }>,
  viewportWidth: number,
  viewportHeight: number,
): void {
  const maxX = Math.max(
    0,
    (mapWidth(viewportWidth, cam.zoomFlat) - viewportWidth) / 2,
  );
  const maxY = Math.max(
    0,
    (mapHeight(viewportHeight, cam.zoomFlat) - viewportHeight) / 2,
  );
  cam.panX = Math.max(-maxX, Math.min(maxX, cam.panX));
  cam.panY = Math.max(-maxY, Math.min(maxY, cam.panY));
}

export function projFlat(
  lat: number,
  lon: number,
  cx: number,
  cy: number,
  width: number,
  height: number,
): Projected {
  return {
    x: cx + (lon / FLAT_MAP_POLICY.longitudeSpan) * (width / 2),
    y: cy - (lat / FLAT_MAP_POLICY.latitudeSpan) * (height / 2),
    z: 1,
  };
}

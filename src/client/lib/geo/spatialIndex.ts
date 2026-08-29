import {
  GeoLimit,
  RADIANS_TO_DEGREES,
} from "@shared/geo";

export function screenToLatLonGlobe(
  mx: number,
  my: number,
  cx: number,
  cy: number,
  r: number,
  rotY: number,
  rotX: number,
): { lat: number; lon: number } | null {
  const nx = (mx - cx) / r;
  const ny = -(my - cy) / r;
  if (nx * nx + ny * ny > 1) return null;
  const nz = Math.sqrt(1 - nx * nx - ny * ny);
  const cosRx = Math.cos(rotX);
  const sinRx = Math.sin(rotX);
  const yWorld = ny * cosRx + nz * sinRx;
  const zWorld = -ny * sinRx + nz * cosRx;
  const phi = Math.acos(Math.max(-1, Math.min(1, yWorld)));
  const lat = GeoLimit.MaxLatitude - phi * RADIANS_TO_DEGREES;
  const theta = Math.atan2(zWorld, -nx);
  let lon =
    (theta - rotY) * RADIANS_TO_DEGREES - GeoLimit.MaxLongitude;
  lon =
    ((lon + GeoLimit.FullLongitudeSpan + GeoLimit.MaxLongitude) %
      GeoLimit.FullLongitudeSpan) - GeoLimit.MaxLongitude;
  return { lat, lon };
}

export function screenToLatLonFlat(
  mx: number,
  my: number,
  flatCx: number,
  flatCy: number,
  mW: number,
  mH: number,
): { lat: number; lon: number } {
  return {
    lat: Math.max(GeoLimit.MinLatitude, Math.min(
      GeoLimit.MaxLatitude,
      -((my - flatCy) / (mH / 2)) * GeoLimit.MaxLatitude,
    )),
    lon: Math.max(GeoLimit.MinLongitude, Math.min(
      GeoLimit.MaxLongitude,
      ((mx - flatCx) / (mW / 2)) * GeoLimit.MaxLongitude,
    )),
  };
}

// ── Inverse projection: screen to lat/lon ────────────────────────────
// Returns approximate lat/lon for a screen point, so the renderer can narrow
// its hit test before projecting candidates.

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
  const lat = 90 - (phi * 180) / Math.PI;
  const theta = Math.atan2(zWorld, -nx);
  let lon = ((theta - rotY) * 180) / Math.PI - 180;
  lon = ((lon + 540) % 360) - 180;
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
    lat: Math.max(-90, Math.min(90, -((my - flatCy) / (mH / 2)) * 90)),
    lon: Math.max(-180, Math.min(180, ((mx - flatCx) / (mW / 2)) * 180)),
  };
}

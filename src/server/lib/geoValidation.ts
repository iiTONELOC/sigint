const LAT_MAX = 90;
const LON_MAX = 180;

/** Return true when both coordinates are finite numbers. */
export function isFiniteCoordinate(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon);
}

/** Return true for the null-island sentinel at 0,0. */
export function isNullIsland(lat: number, lon: number): boolean {
  return lat === 0 && lon === 0;
}

/** Within valid lat/lon bounds. */
export function isInGeoRange(lat: number, lon: number): boolean {
  return lat >= -LAT_MAX && lat <= LAT_MAX && lon >= -LON_MAX && lon <= LON_MAX;
}

/** Return true when the coordinates are finite, in range, and not null island. */
export function isUsableCoordinate(lat: number, lon: number): boolean {
  return isFiniteCoordinate(lat, lon) && isInGeoRange(lat, lon) && !isNullIsland(lat, lon);
}

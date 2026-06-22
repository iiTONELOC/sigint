// One owner for coordinate sanity checks the feed parsers all repeated
// (inconsistently — some used `isFinite`, some `Number.isFinite`, only AIS
// range-checked). Each predicate names one fact.

const LAT_MAX = 90;
const LON_MAX = 180;

/** Both values are real numbers (rejects NaN/Infinity from failed parses). */
export function isFiniteCoordinate(lat: number, lon: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lon);
}

/** Exact 0,0 — "null island", the sentinel a missing geocode decodes to. */
export function isNullIsland(lat: number, lon: number): boolean {
  return lat === 0 && lon === 0;
}

/** Within valid lat/lon bounds. */
export function isInGeoRange(lat: number, lon: number): boolean {
  return lat >= -LAT_MAX && lat <= LAT_MAX && lon >= -LON_MAX && lon <= LON_MAX;
}

/** Finite, in range, and not null-island — the full "usable position" test. */
export function isUsableCoordinate(lat: number, lon: number): boolean {
  return isFiniteCoordinate(lat, lon) && isInGeoRange(lat, lon) && !isNullIsland(lat, lon);
}

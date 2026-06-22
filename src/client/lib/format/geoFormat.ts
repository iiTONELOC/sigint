// One owner for the "27.500°N" coordinate display every dossier hand-built.
// Returns the lat/lon parts separately so each caller keeps its own separator
// (some join with ", ", some with " · ").

const COORD_DECIMALS = 3;

/** Signed latitude → "27.500°N" / "12.300°S". */
export function formatLat(lat: number): string {
  return `${Math.abs(lat).toFixed(COORD_DECIMALS)}°${lat >= 0 ? "N" : "S"}`;
}

/** Signed longitude → "74.600°W" / "5.100°E". */
export function formatLon(lon: number): string {
  return `${Math.abs(lon).toFixed(COORD_DECIMALS)}°${lon >= 0 ? "E" : "W"}`;
}

// ── Hurricane Hunter / reconnaissance aircraft classification ─────────
// Single source of truth for identifying the dedicated tropical-cyclone
// reconnaissance fleet in ADS-B data by ICAO 24-bit hex code. Mirrors the
// militaryRules.ts pattern: imported by both scripts/build-aircraft-db.ts
// (baked into the SQLite `recon` column at build time) and by
// aircraftEnrichment.ts (applied at runtime on a DB-miss).
//
// These are recon aircraft specifically, NOT general military — they get a
// distinct marker on the globe. The list is small and well-known (the entire
// US hurricane-reconnaissance fleet is ~12 airframes):
//
//   USAF 53rd Weather Reconnaissance Squadron ("Hurricane Hunters"),
//   403rd Wing, Keesler AFB — WC-130J, callsigns TEAL 70–79 / CODY:
//     AE0111–AE0117 block (tails 96-5300 … 97-5306) plus AE0258, AE0259,
//     AE04A1 (… 99-5309).
//
//   NOAA Aircraft Operations Center, Lakeland FL:
//     A4FAC3  N42RF  WP-3D Orion "Kermit"  (flies through the storm)
//     A52242  N43RF  WP-3D Orion "Miss Piggy"
//     A60F3C  N49RF  Gulfstream IV-SP "Gonzo" (flies the storm's fringes)
//
// Hex codes verified against the ADS-B Exchange Hurricane Hunter tracker
// list. Stored uppercase; classifyRecon lowercases the input to match.

export const RECON_HEX = new Set([
  // USAF 53rd WRS WC-130J
  "AE0111",
  "AE0112",
  "AE0113",
  "AE0114",
  "AE0116",
  "AE0117",
  "AE0258",
  "AE0259",
  "AE04A1",
  // NOAA AOC
  "A4FAC3", // N42RF WP-3D "Kermit"
  "A52242", // N43RF WP-3D "Miss Piggy"
  "A60F3C", // N49RF Gulfstream IV-SP "Gonzo"
]);

/** True if the ICAO 24-bit hex belongs to the hurricane-reconnaissance fleet. */
export function classifyRecon(icao24: string): boolean {
  if (!icao24) return false;
  return RECON_HEX.has(icao24.toUpperCase());
}

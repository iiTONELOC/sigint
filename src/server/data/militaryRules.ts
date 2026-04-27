// ── Aircraft military classification rules ────────────────────────
// Single source of truth for the three OR'd rules used to flag an
// aircraft as military. Imported by:
//   - scripts/build-aircraft-db.ts — applied at build time, baked
//     into the read-only SQLite DB as the `military` column.
//   - src/server/api/aircraftEnrichment.ts — applied at runtime when
//     enrichRecord falls through to a DB-miss (so AE-prefix mil
//     aircraft and live mil typecodes are still tagged even when the
//     DB has no entry yet).
//
// Rules (any one suffices):
//   1. typecode in MIL_TYPECODES (e.g. F35, B52, P8, REAP)
//   2. operator string contains a MIL_OPERATOR_KEYWORDS entry
//      (case-insensitive substring match — covers AF/Navy/Army across
//       a handful of languages used in the source DB)
//   3. icao24 hex falls in 0xAE0000–0xAFFFFF (US DoD reserved range)

export const MIL_TYPECODES = new Set([
  "F16",
  "F15",
  "F18S",
  "F18H",
  "F22",
  "F35",
  "FA18",
  "F14",
  "F5",
  "F4",
  "EUFI",
  "RFAL",
  "TOR",
  "GRIF",
  "HAWK",
  "TEX2",
  "T38",
  "TUCA",
  "B52",
  "B1",
  "B2",
  "A10",
  "C17",
  "C5",
  "C5M",
  "C30J",
  "C130",
  "C160",
  "A400",
  "C27J",
  "K35R",
  "K35E",
  "KC10",
  "K46A",
  "U2",
  "R135",
  "E3TF",
  "E3CF",
  "E6",
  "P3",
  "P8",
  "E314",
  "H64",
  "H47",
  "H53",
  "H60",
  "V22",
  "LYNX",
  "NH90",
  "TIGR",
  "EH10",
  "PUMA",
  "GAZL",
  "PRED",
  "REAP",
  "GLHK",
]);

export const MIL_OPERATOR_KEYWORDS = [
  "air force",
  "navy",
  "army",
  "military",
  "luftwaffe",
  "marine nationale",
  "fuerza aerea",
  "aeronautica militar",
  "armada",
  "armée de l",
  "ejercito",
  "força aérea",
  "force aerienne",
  "forsvaret",
  "flygvapnet",
];

export const US_MIL_HEX_LO = 0xae0000;
export const US_MIL_HEX_HI = 0xafffff;

export function classifyMilitary(
  icao24: string,
  typecode?: string,
  operator?: string,
): boolean {
  if (typecode && MIL_TYPECODES.has(typecode.toUpperCase())) return true;
  if (operator) {
    const opLower = operator.toLowerCase();
    for (const kw of MIL_OPERATOR_KEYWORDS) {
      if (opLower.includes(kw)) return true;
    }
  }
  const hex = parseInt(icao24, 16);
  if (hex >= US_MIL_HEX_LO && hex <= US_MIL_HEX_HI) return true;
  return false;
}

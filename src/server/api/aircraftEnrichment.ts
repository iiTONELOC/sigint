// ── Server-side aircraft metadata enrichment ─────────────────────────
// Moved verbatim from src/client/features/tracking/aircraft/data/
// typeLookup.ts — same NDJSON parser, same military classification rules,
// same field shape. The DB used to be served via /api/aircraft/metadata/
// db/v1 and parsed in every browser; now it lives entirely server-side
// and is applied to each adsb.fi record before the cache write.

export type AircraftMetadataRecord = {
  icao24: string;
  resolvedType: string;
  typecode?: string;
  model?: string;
  manufacturerName?: string;
  registration?: string;
  operator?: string;
  operatorIcao?: string;
  categoryDescription?: string;
  military: boolean;
};

// ── Military classification (moved from typeLookup.ts:26-121) ─────

const MIL_TYPECODES = new Set([
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

const MIL_OPERATOR_KEYWORDS = [
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

const US_MIL_HEX_LO = 0xae0000;
const US_MIL_HEX_HI = 0xafffff;

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

// ── NDJSON parser (moved from typeLookup.ts:128-161) ──────────────
// Same compact-key shape: { i, r, tc, md, mf, rg, op, oi, ca }.
// Computes `military` once at parse time so per-aircraft enrichment
// is a single Map.get().

export function parseMetadataNdjson(
  text: string,
): Map<string, AircraftMetadataRecord> {
  const map = new Map<string, AircraftMetadataRecord>();
  let pos = 0;
  while (pos < text.length) {
    let end = text.indexOf("\n", pos);
    if (end === -1) end = text.length;
    if (end > pos) {
      try {
        const o = JSON.parse(text.substring(pos, end)) as Record<
          string,
          string
        >;
        if (o.i) {
          map.set(o.i, {
            icao24: o.i,
            resolvedType: o.r ?? "Unknown",
            typecode: o.tc,
            model: o.md,
            manufacturerName: o.mf,
            registration: o.rg,
            operator: o.op,
            operatorIcao: o.oi,
            categoryDescription: o.ca,
            military: classifyMilitary(o.i, o.tc, o.op),
          });
        }
      } catch {
        // skip malformed lines
      }
    }
    pos = end + 1;
  }
  return map;
}

// ── Lazy DB load ─────────────────────────────────────────────────
// 51 MB on disk → ~150 MB resident after parse. Loading lazily on the
// first sweep (rather than at boot) avoids the Heroku 60 s boot
// timeout on cold dyno starts. Subsequent calls share the cached
// promise — single load per process.

const DEFAULT_DB_PATH = "src/server/data/ac-db.ndjson";

let dbPromise: Promise<Map<string, AircraftMetadataRecord>> | null = null;

export function loadMetadataDb(
  path: string = DEFAULT_DB_PATH,
): Promise<Map<string, AircraftMetadataRecord>> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    const file = Bun.file(path);
    if (!(await file.exists())) {
      console.warn(`✈️  enrichment DB not found at ${path} — skipping`);
      return new Map<string, AircraftMetadataRecord>();
    }
    const text = await file.text();
    const map = parseMetadataNdjson(text);
    console.log(`✈️  enrichment DB loaded (${map.size} aircraft records)`);
    return map;
  })();
  return dbPromise;
}

/** TEST-ONLY: clear the cached load promise so tests can swap fixture
 *  paths without process restart. Not exported through the route. */
export function __resetMetadataDbCacheForTests(): void {
  dbPromise = null;
}

// ── Per-record enrichment ────────────────────────────────────────
// Extends the raw adsb.fi record with metadata fields the client used
// to compute itself. The client parser (parseAdsbV2) reads these
// fields verbatim — it no longer carries any DB code.

export function enrichRecord(
  rec: unknown,
  db: Map<string, AircraftMetadataRecord>,
): Record<string, unknown> {
  if (!rec || typeof rec !== "object") return {};
  const r = rec as Record<string, unknown>;
  const hex = typeof r.hex === "string" ? r.hex.toLowerCase() : "";
  const meta = hex ? db.get(hex) : undefined;
  // adsb.fi's `t` field carries the live typecode; fall back to the DB
  // entry's typecode when adsb.fi didn't send one.
  const liveTypecode = typeof r.t === "string" ? r.t : undefined;
  const typecode = liveTypecode ?? meta?.typecode;
  const operator = meta?.operator;
  // If the DB has a record, trust its precomputed `military` flag (set
  // at parse time by the same rules). Otherwise re-derive from the live
  // typecode + hex range so AE-prefix mil aircraft are still tagged
  // even if they aren't in the DB yet.
  const military = meta
    ? meta.military
    : classifyMilitary(hex, liveTypecode, operator);
  return {
    ...r,
    acType: meta?.resolvedType ?? "Unknown",
    typecode,
    model: meta?.model,
    manufacturerName: meta?.manufacturerName,
    registration: meta?.registration,
    operator,
    operatorIcao: meta?.operatorIcao,
    categoryDescription: meta?.categoryDescription,
    military,
  };
}

// ── Server-side aircraft metadata enrichment ─────────────────────────
// Reads the per-record metadata block (resolved type, registration,
// operator, manufacturer, model, category, military flag) from the
// read-only SQLite DB at src/server/data/ac-db.sqlite, generated at
// build time by scripts/build-aircraft-db.ts from the source NDJSON.
//
// Heap impact: the prior in-memory Map kept ~617 k records resident
// (~300 MB after parse). The SQLite path opens a single connection,
// caches one prepared statement, and answers each lookup in <0.05 ms
// — the ~300 MB heap savings is the entire point of this module.
//
// The exported function signatures and the returned record shape are
// identical to the prior Map-based path. aircraftCache.ts (the only
// non-test caller) is unchanged: it still awaits loadMetadataDb()
// during sweep warm-up and passes the (now-unused) Map argument to
// enrichRecord. enrichRecord ignores its second parameter and reads
// from the cached SQLite handle instead.
//
// classifyMilitary lives in src/server/data/militaryRules.ts so the
// build script and runtime apply the exact same three-rule logic. It
// is re-exported here so existing test imports still resolve.

import { Database, type Statement } from "bun:sqlite";
import { classifyMilitary } from "../data/militaryRules";
import { classifyRecon } from "../data/reconRules";
import { countryFromIcao24 } from "../data/icao24CountryRanges";
import { createLogger, type Logger } from "../lib/logger";

let logger: Logger = createLogger({ service: "aircraft-enrichment" });

/** TEST-ONLY: swap the module's logger so tests can capture output via
 *  a custom sink instead of spying on console. Not exported through any route. */
export function __setLoggerForTests(l: Logger): void {
  logger = l;
}

export { classifyMilitary } from "../data/militaryRules";

/** Operator-visible warning fires when the SQLite metadata DB is
 *  older than this. 90 days matches the typical OpenSky aircraft
 *  database refresh cadence — past this point new tail registrations
 *  and operator changes start to dominate the DB-miss rate. Exported
 *  so the spec can construct boundary fixtures. */
export const AC_DB_STALE_THRESHOLD_MS = 90 * 24 * 3600 * 1000;

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

// ── Lazy SQLite handle ───────────────────────────────────────────
// Opens read-only on first lookup, reuses one prepared statement for
// every query. Booting the dyno no longer touches this DB at all —
// the first /api/aircraft/states sweep triggers the open via
// loadMetadataDb's warm-up call from aircraftCache.ts.

const DEFAULT_DB_PATH = "src/server/data/ac-db.sqlite";

const SELECT_SQL = `
  SELECT
    resolved_type, typecode, model, manufacturer_name,
    registration, operator, operator_icao, category_description, military
  FROM aircraft
  WHERE icao24 = ?
  LIMIT 1
`;

type DbRow = {
  resolved_type: string;
  typecode: string | null;
  model: string | null;
  manufacturer_name: string | null;
  registration: string | null;
  operator: string | null;
  operator_icao: string | null;
  category_description: string | null;
  military: number;
};

let metadataDbPath: string = DEFAULT_DB_PATH;
let cachedDb: Database | null = null;
let cachedSelect: Statement<DbRow, [string]> | null = null;
// Sticky flag — once we've determined the SQLite file is missing,
// stop re-checking on every lookup. Mirrors the old Map-based path's
// "warn once, fall through" behaviour.
let dbMissing = false;

async function initializeDb(): Promise<void> {
  if (cachedSelect || dbMissing) return;
  const file = Bun.file(metadataDbPath);
  if (!(await file.exists())) {
    logger.warn(
      `✈️  enrichment DB not found at ${metadataDbPath} — skipping`,
    );
    dbMissing = true;
    return;
  }
  // Freshness check via Bun.file.lastModified (epoch ms). Best-effort:
  // if lastModified is 0 or unreadable, skip the warn — the open below
  // will surface any real I/O error.
  const mtimeMs = file.lastModified;
  if (mtimeMs > 0) {
    const ageMs = Date.now() - mtimeMs;
    if (ageMs >= AC_DB_STALE_THRESHOLD_MS) {
      const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
      const builtAt = new Date(mtimeMs).toISOString();
      logger.warn(
        `⚠️  ac-db.sqlite is ${ageDays} days old — regenerate via 'bun run build:aircraft-db' (last built ${builtAt})`,
      );
    }
  }
  cachedDb = new Database(metadataDbPath, { readonly: true });
  cachedDb.run("PRAGMA query_only = 1;");
  cachedSelect = cachedDb.prepare<DbRow, [string]>(SELECT_SQL);
  const countRow = cachedDb
    .query<{ c: number }, []>("SELECT COUNT(*) AS c FROM aircraft")
    .get();
  logger.info(
    `✈️  enrichment DB opened (${metadataDbPath}, ${countRow?.c ?? 0} records)`,
  );
}

/** Warm-up the SQLite handle. Returns an (empty) Map only because the
 *  prior NDJSON-based signature handed back a Map<icao24, record> for
 *  aircraftCache.ts to thread into enrichRecord. The Map is unused —
 *  enrichRecord reads from the cached prepared statement directly —
 *  so signature parity is preserved without the ~300 MB heap cost.
 *
 *  When `path` differs from the cached path, the prior connection is
 *  closed and the cache is reset (test-fixture support). */
export async function loadMetadataDb(
  path: string = DEFAULT_DB_PATH,
): Promise<Map<string, AircraftMetadataRecord>> {
  if (path !== metadataDbPath) {
    if (cachedDb) cachedDb.close();
    cachedDb = null;
    cachedSelect = null;
    dbMissing = false;
    metadataDbPath = path;
  }
  await initializeDb();
  return new Map<string, AircraftMetadataRecord>();
}

/** TEST-ONLY: close the cached SQLite handle and reset the path so
 *  tests can swap fixture DBs without process restart. Not exported
 *  through any route. */
export function __resetMetadataDbCacheForTests(): void {
  if (cachedDb) cachedDb.close();
  cachedDb = null;
  cachedSelect = null;
  dbMissing = false;
  metadataDbPath = DEFAULT_DB_PATH;
}

// ── Per-record enrichment ────────────────────────────────────────
// Extends the raw adsb.fi record with the metadata fields the client
// reads. Identical output shape to the prior Map-based path; the
// `_db` parameter is preserved for signature parity but is ignored —
// every lookup goes through the cached prepared statement.

export function enrichRecord(
  rec: unknown,
  _db: Map<string, AircraftMetadataRecord>,
): Record<string, unknown> {
  if (!rec || typeof rec !== "object") return {};
  const r = rec as Record<string, unknown>;
  const hex = typeof r.hex === "string" ? r.hex.toLowerCase() : "";
  const liveTypecode = typeof r.t === "string" ? r.t : undefined;

  // cachedSelect is populated by initializeDb() during loadMetadataDb().
  // Callers (aircraftCache sweep) always await loadMetadataDb before
  // invoking enrichRecord, so cachedSelect is either set or the DB is
  // confirmed missing.
  const row = hex && cachedSelect ? (cachedSelect.get(hex) ?? null) : null;

  // originCountry derives from the ICAO 24-bit registration block —
  // deterministic given the hex, so the same value applies on DB
  // hit and DB miss. Falls through to "" when the hex is unmapped
  // (preserving the prior empty-string baseline for any consumer
  // checking falsy).
  const originCountry = countryFromIcao24(hex);

  // recon is deterministic from the hex (a fixed fleet list), so it applies
  // identically on DB hit and miss — same as originCountry.
  const recon = classifyRecon(hex);

  if (!row) {
    // No DB row (or hex unavailable / DB missing) — fall back to the
    // live typecode + hex range so AE-prefix mil aircraft and live
    // mil typecodes are still tagged. operator is undefined here
    // because there's no DB-side operator string to consult, exactly
    // like the prior Map-miss path.
    return {
      ...r,
      acType: "Unknown",
      typecode: liveTypecode,
      model: undefined,
      manufacturerName: undefined,
      registration: undefined,
      operator: undefined,
      operatorIcao: undefined,
      categoryDescription: undefined,
      originCountry,
      military: classifyMilitary(hex, liveTypecode),
      recon,
    };
  }

  // adsb.fi's live `t` field wins over the DB typecode when present —
  // the DB is a snapshot and the live record has the freshest value.
  const typecode = liveTypecode ?? row.typecode;
  return {
    ...r,
    acType: row.resolved_type,
    typecode,
    model: row.model ?? undefined,
    manufacturerName: row.manufacturer_name ?? undefined,
    registration: row.registration ?? undefined,
    operator: row.operator ?? undefined,
    operatorIcao: row.operator_icao ?? undefined,
    categoryDescription: row.category_description ?? undefined,
    originCountry,
    military: row.military === 1,
    recon,
  };
}

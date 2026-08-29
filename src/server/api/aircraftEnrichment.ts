import { Database, type Statement } from "bun:sqlite";
import { classifyRecon } from "@shared/domain/aircraft";
import { normalizeIcao24 } from "@shared/domain/aircraftDossier";
import { classifyMilitary } from "../data/militaryRules";
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
 *  database refresh cadence. Past this point, new tail registrations
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

function metadataRecord(
  icao24: string,
  row: DbRow,
): AircraftMetadataRecord {
  return {
    icao24,
    resolvedType: row.resolved_type,
    typecode: row.typecode ?? undefined,
    model: row.model ?? undefined,
    manufacturerName: row.manufacturer_name ?? undefined,
    registration: row.registration ?? undefined,
    operator: row.operator ?? undefined,
    operatorIcao: row.operator_icao ?? undefined,
    categoryDescription: row.category_description ?? undefined,
    military: row.military === 1,
  };
}

let metadataDbPath: string = DEFAULT_DB_PATH;
let cachedDb: Database | null = null;
let cachedSelect: Statement<DbRow, [string]> | null = null;
// After the SQLite file is confirmed missing, skip later checks. This retains
// the previous warning-once behavior.
let dbMissing = false;

async function initializeDb(): Promise<void> {
  if (cachedSelect || dbMissing) return;
  const file = Bun.file(metadataDbPath);
  if (!(await file.exists())) {
    logger.warn(
      `✈️  enrichment DB not found at ${metadataDbPath}: skipping`,
    );
    dbMissing = true;
    return;
  }
  // Freshness check via Bun.file.lastModified (epoch ms). Best-effort:
  // If lastModified is 0 or unreadable, skip the warning. The open below
  // will surface any real I/O error.
  const mtimeMs = file.lastModified;
  if (mtimeMs > 0) {
    const ageMs = Date.now() - mtimeMs;
    if (ageMs >= AC_DB_STALE_THRESHOLD_MS) {
      const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
      const builtAt = new Date(mtimeMs).toISOString();
      logger.warn(
        `⚠️  ac-db.sqlite is ${ageDays} days old. Regenerate via 'bun run build:aircraft-db' (last built ${builtAt})`,
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

export async function loadMetadataDb(
  path: string = DEFAULT_DB_PATH,
): Promise<void> {
  if (path !== metadataDbPath) {
    if (cachedDb) cachedDb.close();
    cachedDb = null;
    cachedSelect = null;
    dbMissing = false;
    metadataDbPath = path;
  }
  await initializeDb();
}

/** Read one aircraft directly from the local metadata owner. */
export async function lookupAircraftMetadata(
  icao24: string,
): Promise<AircraftMetadataRecord | null> {
  await initializeDb();
  const normalized = normalizeIcao24(icao24);
  if (!normalized || !cachedSelect) return null;
  const row = cachedSelect.get(normalized) ?? null;
  return row ? metadataRecord(normalized, row) : null;
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

export function enrichRecord(rec: unknown): Record<string, unknown> {
  if (!rec || typeof rec !== "object") return {};
  const r = rec as Record<string, unknown>;
  const hex = normalizeIcao24(
    typeof r.hex === "string" ? r.hex : undefined,
  ) ?? "";
  const liveTypecode = typeof r.t === "string" ? r.t : undefined;

  // cachedSelect is populated by initializeDb() during loadMetadataDb().
  // Callers (aircraftCache sweep) always await loadMetadataDb before
  // invoking enrichRecord, so cachedSelect is either set or the DB is
  // confirmed missing.
  const row = hex && cachedSelect ? (cachedSelect.get(hex) ?? null) : null;
  const metadata = row ? metadataRecord(hex, row) : null;

  // originCountry derives from the ICAO 24-bit registration block. It behaves
  // the same on DB hits and misses and remains empty when the hex is unmapped.
  const originCountry = countryFromIcao24(hex);

  // Recon depends only on the hex, so it behaves the same on hits and misses.
  const recon = classifyRecon(hex);

  if (!metadata) {
    // With no DB row, use the live typecode and hex range. This retains
    // military detection while the operator remains unavailable.
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

  // The live typecode wins because the database is a snapshot.
  const typecode = liveTypecode ?? metadata.typecode;
  return {
    ...r,
    acType: metadata.resolvedType,
    typecode,
    model: metadata.model,
    manufacturerName: metadata.manufacturerName,
    registration: metadata.registration,
    operator: metadata.operator,
    operatorIcao: metadata.operatorIcao,
    categoryDescription: metadata.categoryDescription,
    originCountry,
    military: metadata.military,
    recon,
  };
}

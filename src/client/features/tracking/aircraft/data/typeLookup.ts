export type AircraftMetadata = {
  icao24: string;
  resolvedType: string;
  typecode?: string;
  model?: string;
  manufacturerName?: string;
  registration?: string;
  operator?: string;
  operatorIcao?: string;
  categoryDescription?: string;
  military?: boolean;
};

import { authenticatedFetch } from "@/lib/authService";
import { cacheGet, cacheSet } from "@/lib/storageService";
import { CACHE_KEYS } from "@/lib/cacheKeys";
import { normalizeIcao24 } from "../lib/utils";

// ── DB version — must match the versioned server route ───────────────
// Bump both here and in server/api/index.ts when ac-db.ndjson is rebuilt.
const DB_VERSION = "v1";
const DB_URL = `/api/aircraft/metadata/db/${DB_VERSION}`;

// ── Military classification (mirrored from server) ───────────────────

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

function classifyMilitary(
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

// ── Local DB ─────────────────────────────────────────────────────────

let metadataMap: Map<string, AircraftMetadata> | null = null;
let loadPromise: Promise<void> | null = null;

function parseNdjsonToMap(text: string): Map<string, AircraftMetadata> {
  const map = new Map<string, AircraftMetadata>();
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

type CachedDb = { version: string; ndjson: string };

async function loadDb(): Promise<void> {
  if (metadataMap) return;

  // 1. Try IndexedDB — if we have this version cached, just parse it
  try {
    const cached = await cacheGet<CachedDb>(CACHE_KEYS.aircraftMetadataDb);
    if (cached && cached.version === DB_VERSION && cached.ndjson) {
      metadataMap = parseNdjsonToMap(cached.ndjson);
      return;
    }
  } catch {
    // IndexedDB failure — fall through to network
  }

  // 2. Fetch from server
  try {
    const res = await authenticatedFetch(DB_URL);
    if (!res.ok) {
      console.warn(`Aircraft metadata DB fetch failed: ${res.status}`);
      return;
    }
    if (typeof res.text !== "function") return;
    const ndjson = await res.text();
    metadataMap = parseNdjsonToMap(ndjson);

    // 3. Persist to IndexedDB for next load (non-blocking)
    cacheSet(CACHE_KEYS.aircraftMetadataDb, {
      version: DB_VERSION,
      ndjson,
    } satisfies CachedDb).catch(() => {});
  } catch {
    // Non-fatal — DB enrichment is best-effort.
    // In test environments fetch may not be available.
  }
}

/** Ensure the DB is loaded. Safe to call multiple times — deduped. */
export function ensureMetadataDb(): Promise<void> {
  if (metadataMap) return Promise.resolve();
  if (!loadPromise) {
    loadPromise = loadDb().finally(() => {
      loadPromise = null;
    });
  }
  return loadPromise;
}

/** Synchronous lookup — returns null if DB not loaded yet or not found. */
export function getMetadataSync(icao24: string): AircraftMetadata | null {
  if (!metadataMap) return null;
  const key = normalizeIcao24(icao24);
  if (!key) return null;
  return metadataMap.get(key) ?? null;
}

/** Whether the DB has been loaded into memory. */
export function isMetadataDbReady(): boolean {
  return metadataMap !== null;
}

// ── Public API — same signatures as before ───────────────────────────
// These maintain the existing contract so nothing breaks.

export async function getAircraftMetadata(
  icao24?: string,
): Promise<AircraftMetadata | null> {
  const key = normalizeIcao24(icao24);
  if (!key) return null;
  await ensureMetadataDb();
  return metadataMap?.get(key) ?? null;
}

export async function getAircraftMetadataBatch(
  icao24List: string[],
): Promise<Map<string, AircraftMetadata>> {
  await ensureMetadataDb();
  const result = new Map<string, AircraftMetadata>();
  if (!metadataMap) return result;

  for (const raw of icao24List) {
    const key = normalizeIcao24(raw);
    if (!key) continue;
    const meta = metadataMap.get(key);
    if (meta) result.set(key, meta);
  }
  return result;
}


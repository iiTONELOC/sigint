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
};

/**
 * Points at the pre-built NDJSON (sorted by icao24, one JSON object per line).
 * Generated at build time by scripts/build-aircraft-db.ts from the OpenSky CSV.
 * No decompression needed — the file is committed uncompressed (~51 MB).
 */
const DB_FILE = Bun.file(new URL("../data/ac-db.ndjson", import.meta.url));

// ---------------------------------------------------------------------------
// Short-lived text cache – keeps the 51 MB string around for 60 s so that a
// single enrichment cycle (single + batch lookup in quick succession) only
// reads the file once.  After 60 s the string is released for GC.
// ---------------------------------------------------------------------------
const TEXT_TTL = 60_000;
let cachedText: string | null = null;
let cachedTextExpiry = 0;
let inflightRead: Promise<string | null> | null = null;

async function getText(): Promise<string | null> {
  const now = Date.now();
  if (cachedText && now < cachedTextExpiry) return cachedText;

  if (inflightRead) return inflightRead;

  inflightRead = (async () => {
    if (!(await DB_FILE.exists())) return null;
    const text = await DB_FILE.text();
    cachedText = text;
    cachedTextExpiry = Date.now() + TEXT_TTL;
    setTimeout(() => {
      if (Date.now() >= cachedTextExpiry) cachedText = null;
    }, TEXT_TTL + 1_000);
    return text;
  })();

  try {
    return await inflightRead;
  } finally {
    inflightRead = null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeIcao24(value: string | undefined): string | null {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^['"]|['"]$/g, "");
  if (!normalized) return null;
  if (!/^[0-9a-f]+$/i.test(normalized)) return null;
  return normalized.length < 6 ? normalized.padStart(6, "0") : normalized;
}

/** Fast icao24 extraction without JSON.parse — every line starts with {"i":"…" */
function extractIcao(text: string, lineStart: number): string | null {
  const s = text.indexOf('"i":"', lineStart);
  if (s === -1 || s > lineStart + 10) return null;
  const vs = s + 5;
  const ve = text.indexOf('"', vs);
  if (ve === -1) return null;
  return text.substring(vs, ve);
}

/** Full parse of one NDJSON line → AircraftMetadata */
function parseRow(line: string): AircraftMetadata | null {
  try {
    const o = JSON.parse(line) as Record<string, string>;
    if (!o.i) return null;
    return {
      icao24: o.i,
      resolvedType: o.r ?? "Unknown",
      typecode: o.tc,
      model: o.md,
      manufacturerName: o.mf,
      registration: o.rg,
      operator: o.op,
      operatorIcao: o.oi,
      categoryDescription: o.ca,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function lookupAircraftMetadata(
  icao24: string,
): Promise<AircraftMetadata | null> {
  const key = normalizeIcao24(icao24);
  if (!key) return null;

  const text = await getText();
  if (!text) return null;

  let pos = 0;
  while (pos < text.length) {
    let end = text.indexOf("\n", pos);
    if (end === -1) end = text.length;

    const lineIcao = extractIcao(text, pos);
    if (lineIcao === key) return parseRow(text.substring(pos, end));
    if (lineIcao && lineIcao > key) return null; // sorted — bail early

    pos = end + 1;
  }

  return null;
}

export async function lookupAircraftMetadataBatch(
  icao24List: string[],
): Promise<AircraftMetadata[]> {
  const normalized = Array.from(
    new Set(
      icao24List
        .map((v) => normalizeIcao24(v))
        .filter((v): v is string => v !== null),
    ),
  );
  if (normalized.length === 0) return [];

  const text = await getText();
  if (!text) return [];

  normalized.sort();
  const wanted = new Set(normalized);
  const results: AircraftMetadata[] = [];
  const maxKey = normalized[normalized.length - 1]!;

  let pos = 0;
  while (pos < text.length && wanted.size > 0) {
    let end = text.indexOf("\n", pos);
    if (end === -1) end = text.length;

    const lineIcao = extractIcao(text, pos);
    if (lineIcao && lineIcao > maxKey) break;

    if (lineIcao && wanted.has(lineIcao)) {
      const meta = parseRow(text.substring(pos, end));
      if (meta) results.push(meta);
      wanted.delete(lineIcao);
    }

    pos = end + 1;
  }

  return results;
}

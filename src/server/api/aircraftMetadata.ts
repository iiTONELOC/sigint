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

// ── Military classification heuristic ────────────────────────────────
// Uses three independent signals: ICAO type code, operator name, and
// US DoD ICAO hex range. Any single signal is sufficient.

const MIL_TYPECODES = new Set([
  // Fighters
  "F16", "F15", "F18S", "F18H", "F22", "F35", "FA18", "F14", "F5", "F4",
  "EUFI", "RFAL", "TOR", "GRIF", "HAWK", "TEX2", "T38", "TUCA",
  // Bombers
  "B52", "B1", "B2",
  // Attack
  "A10",
  // Transport (mil-only)
  "C17", "C5", "C5M", "C30J", "C130", "C160", "A400", "C27J",
  // Tankers
  "K35R", "K35E", "KC10", "K46A",
  // Recon / ISR / AWACS
  "U2", "R135", "E3TF", "E3CF", "E6", "P3", "P8", "E314",
  // Rotary (mil-specific)
  "H64", "H47", "H53", "H60", "V22", "LYNX", "NH90", "TIGR", "EH10",
  "PUMA", "GAZL",
  // UAV
  "PRED", "REAP", "GLHK",
]);

const MIL_OPERATOR_KEYWORDS = [
  "air force", "navy", "army", "military", "luftwaffe",
  "marine nationale", "fuerza aerea", "aeronautica militar",
  "armada", "armée de l", "ejercito", "força aérea",
  "force aerienne", "forsvaret", "flygvapnet",
];

// US DoD ICAO hex block: AE0000–AFFFFF
const US_MIL_HEX_LO = 0xae0000;
const US_MIL_HEX_HI = 0xafffff;

function classifyMilitary(
  icao24: string,
  typecode?: string,
  operator?: string,
): boolean {
  // Signal 1: type code is an inherently military platform
  if (typecode && MIL_TYPECODES.has(typecode.toUpperCase())) return true;

  // Signal 2: operator name contains military keyword
  if (operator) {
    const opLower = operator.toLowerCase();
    for (const kw of MIL_OPERATOR_KEYWORDS) {
      if (opLower.includes(kw)) return true;
    }
  }

  // Signal 3: ICAO hex falls in US DoD block
  const hex = parseInt(icao24, 16);
  if (hex >= US_MIL_HEX_LO && hex <= US_MIL_HEX_HI) return true;

  return false;
}

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
      military: classifyMilitary(o.i, o.tc, o.op),
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

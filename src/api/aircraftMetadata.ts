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

const NULLISH_TEXT = new Set([
  "",
  "unknown",
  "unknow",
  "n/a",
  "na",
  "null",
  "none",
  "0",
  "-unknown-",
]);

const DB_FILE = Bun.file(new URL("../data/ac-db.csv", import.meta.url));
let lookupPromise: Promise<Map<string, AircraftMetadata>> | null = null;

function normalizeHeader(value: string): string {
  return value
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoteChar: "'" | '"' | null = null;

  for (let i = 0; i < line.length; i++) {
    const { [i]: ch } = line;
    if ((ch === '"' || ch === "'") && quoteChar === null) {
      quoteChar = ch;
      continue;
    }

    if (quoteChar !== null && ch === quoteChar) {
      const { [i + 1]: next } = line;
      if (next === quoteChar) {
        cur += quoteChar;
        i++;
      } else {
        quoteChar = null;
      }
      continue;
    }

    if (ch === "," && quoteChar === null) {
      out.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  out.push(cur);
  return out.map((v) => v.trim().replace(/^['"]|['"]$/g, ""));
}

function cleanText(value: string | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return undefined;
  const lowered = trimmed.toLowerCase();
  if (NULLISH_TEXT.has(lowered)) return undefined;
  return trimmed.replace(/â€“/g, "-");
}

function normalizeIcao24(value: string | undefined): string | null {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^['"]|['"]$/g, "");
  if (!normalized) return null;
  if (!/^[0-9a-f]+$/i.test(normalized)) return null;
  return normalized.length < 6 ? normalized.padStart(6, "0") : normalized;
}

function resolveType(parts: {
  typecode?: string;
  manufacturerName?: string;
  model?: string;
  categoryDescription?: string;
}): string {
  const { typecode, manufacturerName, model, categoryDescription } = parts;
  if (typecode) return typecode;
  if (manufacturerName && model) return `${manufacturerName} ${model}`;
  if (model) return model;
  if (categoryDescription) return categoryDescription;
  return "Unknown";
}

function qualityScore(parts: {
  typecode?: string;
  model?: string;
  manufacturerName?: string;
  registration?: string;
  operatorIcao?: string;
  categoryDescription?: string;
}): number {
  const {
    typecode,
    model,
    manufacturerName,
    registration,
    operatorIcao,
    categoryDescription,
  } = parts;
  let score = 0;
  if (typecode) score += 6;
  if (model) score += 4;
  if (manufacturerName) score += 3;
  if (registration) score += 2;
  if (operatorIcao) score += 2;
  if (categoryDescription) score += 1;
  return score;
}

async function buildLookup(): Promise<Map<string, AircraftMetadata>> {
  const exists = await DB_FILE.exists();
  if (!exists) return new Map();

  const csv = await DB_FILE.text();
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return new Map();

  const headers = splitCsvLine(lines[0] ?? "").map(normalizeHeader);
  const idxIcao = headers.findIndex((h) => h === "icao24");
  const idxTypecode = headers.findIndex((h) => h === "typecode");
  const idxModel = headers.findIndex((h) => h === "model");
  const idxManufacturer = headers.findIndex((h) => h === "manufacturername");
  const idxRegistration = headers.findIndex((h) => h === "registration");
  const idxOperator = headers.findIndex((h) => h === "operator");
  const idxOperatorIcao = headers.findIndex((h) => h === "operatoricao");
  const idxCategory = headers.findIndex((h) => h === "categorydescription");
  if (idxIcao < 0) return new Map();

  const map = new Map<string, AircraftMetadata>();
  const scoreByIcao = new Map<string, number>();

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i] ?? "");
    const icao24 = normalizeIcao24(cols[idxIcao]);
    if (!icao24) continue;

    const typecode = cleanText(cols[idxTypecode]);
    const model = cleanText(cols[idxModel]);
    const manufacturerName = cleanText(cols[idxManufacturer]);
    const registration = cleanText(cols[idxRegistration]);
    const operator = cleanText(cols[idxOperator]);
    const operatorIcao = cleanText(cols[idxOperatorIcao]);
    const categoryDescription = cleanText(cols[idxCategory]);

    const resolvedType = resolveType({
      typecode,
      manufacturerName,
      model,
      categoryDescription,
    });

    const candidate: AircraftMetadata = {
      icao24,
      resolvedType,
      typecode,
      model,
      manufacturerName,
      registration,
      operator,
      operatorIcao,
      categoryDescription,
    };

    const score = qualityScore(candidate);
    const prevScore = scoreByIcao.get(icao24) ?? -1;
    if (score < prevScore) continue;

    map.set(icao24, candidate);
    scoreByIcao.set(icao24, score);
  }

  return map;
}

async function getLookup(): Promise<Map<string, AircraftMetadata>> {
  if (!lookupPromise) {
    lookupPromise = buildLookup();
  }
  return lookupPromise;
}

export async function lookupAircraftMetadata(
  icao24: string,
): Promise<AircraftMetadata | null> {
  const key = normalizeIcao24(icao24);
  if (!key) return null;
  const lookup = await getLookup();
  return lookup.get(key) ?? null;
}

export async function lookupAircraftMetadataBatch(
  icao24List: string[],
): Promise<AircraftMetadata[]> {
  const normalized = Array.from(
    new Set(
      icao24List
        .map((value) => normalizeIcao24(value))
        .filter((value): value is string => value !== null),
    ),
  );
  if (normalized.length === 0) return [];

  const lookup = await getLookup();
  return normalized
    .map((icao24) => lookup.get(icao24))
    .filter((item): item is AircraftMetadata => Boolean(item));
}

/** Convert OpenSky aircraft metadata to the runtime NDJSON format. */

import { gunzip } from "zlib";
import { promisify } from "util";
import { resolve } from "path";
import { AircraftDatabaseField } from "./build-aircraft-db";

const gunzipAsync = promisify(gunzip);
const CSV_FIELD_SEPARATOR = ",";
const BYTES_PER_MEBIBYTE = 1_048_576;
const SURROUNDING_QUOTE_PATTERN = /^['"]|['"]$/g;

export enum AircraftCsvQuote {
  Double = '"',
  Single = "'",
}

export enum NullishAircraftText {
  Empty = "",
  Unknown = "unknown",
  MisspelledUnknown = "unknow",
  NotApplicable = "n/a",
  NotApplicableShort = "na",
  Null = "null",
  None = "none",
  Zero = "0",
  DashedUnknown = "-unknown-",
}

export enum AircraftCsvHeader {
  Icao24 = "icao24",
  Typecode = "typecode",
  Model = "model",
  Manufacturer = "manufacturername",
  Registration = "registration",
  Operator = "operator",
  OperatorIcao = "operatoricao",
  Category = "categorydescription",
}

export enum AircraftMetadataScore {
  Typecode = 6,
  Model = 4,
  Manufacturer = 3,
  SecondaryIdentifier = 2,
  Category = 1,
}

export type AircraftCsvColumnIndexes = Readonly<{
  icao24: number;
  typecode: number;
  model: number;
  manufacturer: number;
  registration: number;
  operator: number;
  operatorIcao: number;
  category: number;
}>;

export type RankedAircraftRow = Readonly<{
  score: number;
  serialized: string;
}>;

const NULLISH_TEXT: ReadonlySet<string> = new Set(
  Object.values(NullishAircraftText),
);

function normalizeHeader(v: string): string {
  return v
    .trim()
    .replace(SURROUNDING_QUOTE_PATTERN, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quote: AircraftCsvQuote | null = null;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (
      quote === null &&
      (character === AircraftCsvQuote.Double ||
        character === AircraftCsvQuote.Single)
    ) {
      quote = character;
      continue;
    }
    if (quote !== null && character === quote) {
      if (line[index + 1] === quote) {
        current += quote;
        index += 1;
      } else {
        quote = null;
      }
      continue;
    }
    if (character === CSV_FIELD_SEPARATOR && quote === null) {
      fields.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  fields.push(current);
  return fields.map((value) =>
    value.trim().replace(SURROUNDING_QUOTE_PATTERN, ""),
  );
}

function clean(value: string | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  if (!trimmed || NULLISH_TEXT.has(trimmed.toLowerCase())) {
    return undefined;
  }
  return trimmed.replaceAll("\u00e2\u20ac\u201d", "-");
}

function normIcao(value: string | undefined): string | null {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(SURROUNDING_QUOTE_PATTERN, "");
  if (!normalized || !/^[0-9a-f]+$/i.test(normalized)) {
    return null;
  }
  return normalized.length < 6 ? normalized.padStart(6, "0") : normalized;
}

function resolveType(
  typecode?: string,
  manufacturer?: string,
  model?: string,
  category?: string,
): string {
  if (typecode) {
    return typecode;
  }
  if (manufacturer && model) {
    return `${manufacturer} ${model}`;
  }
  if (model) {
    return model;
  }
  if (category) {
    return category;
  }
  return "Unknown";
}

function score(
  typecode?: string,
  model?: string,
  manufacturer?: string,
  registration?: string,
  operatorIcao?: string,
  category?: string,
): number {
  let total = 0;
  if (typecode) {
    total += AircraftMetadataScore.Typecode;
  }
  if (model) {
    total += AircraftMetadataScore.Model;
  }
  if (manufacturer) {
    total += AircraftMetadataScore.Manufacturer;
  }
  if (registration) {
    total += AircraftMetadataScore.SecondaryIdentifier;
  }
  if (operatorIcao) {
    total += AircraftMetadataScore.SecondaryIdentifier;
  }
  if (category) {
    total += AircraftMetadataScore.Category;
  }
  return total;
}

export function aircraftCsvColumnIndexes(
  headers: readonly string[],
): AircraftCsvColumnIndexes {
  return {
    icao24: headers.indexOf(AircraftCsvHeader.Icao24),
    typecode: headers.indexOf(AircraftCsvHeader.Typecode),
    model: headers.indexOf(AircraftCsvHeader.Model),
    manufacturer: headers.indexOf(AircraftCsvHeader.Manufacturer),
    registration: headers.indexOf(AircraftCsvHeader.Registration),
    operator: headers.indexOf(AircraftCsvHeader.Operator),
    operatorIcao: headers.indexOf(AircraftCsvHeader.OperatorIcao),
    category: headers.indexOf(AircraftCsvHeader.Category),
  };
}

export function parseAircraftRows(
  lines: readonly string[],
  indexes: AircraftCsvColumnIndexes,
): Map<string, RankedAircraftRow> {
  const best = new Map<string, RankedAircraftRow>();
  for (const line of lines) {
    const columns = splitCsvLine(line);
    const icao24 = normIcao(columns[indexes.icao24]);
    if (!icao24) {
      continue;
    }

    const typecode = clean(columns[indexes.typecode]);
    const model = clean(columns[indexes.model]);
    const manufacturer = clean(columns[indexes.manufacturer]);
    const registration = clean(columns[indexes.registration]);
    const operator = clean(columns[indexes.operator]);
    const operatorIcao = clean(columns[indexes.operatorIcao]);
    const category = clean(columns[indexes.category]);
    const resolvedType = resolveType(
      typecode,
      manufacturer,
      model,
      category,
    );
    const metadataScore = score(
      typecode,
      model,
      manufacturer,
      registration,
      operatorIcao,
      category,
    );
    const previous = best.get(icao24);
    if (previous && previous.score >= metadataScore) {
      continue;
    }

    const record: Partial<Record<AircraftDatabaseField, string>> = {
      [AircraftDatabaseField.Icao24]: icao24,
      [AircraftDatabaseField.ResolvedType]: resolvedType,
      [AircraftDatabaseField.Typecode]: typecode,
      [AircraftDatabaseField.Model]: model,
      [AircraftDatabaseField.Manufacturer]: manufacturer,
      [AircraftDatabaseField.Registration]: registration,
      [AircraftDatabaseField.Operator]: operator,
      [AircraftDatabaseField.OperatorIcao]: operatorIcao,
      [AircraftDatabaseField.Category]: category,
    };
    best.set(icao24, {
      score: metadataScore,
      serialized: JSON.stringify(record),
    });
  }
  return best;
}

export function compareAircraftIcaoEntries(
  [leftIcao]: readonly [string, RankedAircraftRow],
  [rightIcao]: readonly [string, RankedAircraftRow],
): number {
  if (leftIcao < rightIcao) {
    return -1;
  }
  if (leftIcao > rightIcao) {
    return 1;
  }
  return 0;
}

async function main(): Promise<void> {
  const [, , inputArgument] = process.argv;
  if (!inputArgument) {
    console.error(
      "Usage: bun run src/scripts/convert-aircraft-csv.ts <path-to-csv-or-csv.gz>",
    );
    process.exit(1);
  }

  const inputPath = resolve(inputArgument);
  const inputFile = Bun.file(inputPath);
  if (!(await inputFile.exists())) {
    console.error(`File not found: ${inputPath}`);
    process.exit(1);
  }

  console.log(`Reading ${inputPath}...`);
  let csv: string;

  if (inputPath.endsWith(".gz")) {
    const compressed = await inputFile.arrayBuffer();
    csv = (await gunzipAsync(Buffer.from(compressed))).toString("utf-8");
  } else {
    csv = await inputFile.text();
  }

  const lines = csv
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  const [headerLine, ...dataLines] = lines;
  if (!headerLine || dataLines.length === 0) {
    console.error("CSV too short");
    process.exit(1);
  }

  const headers = splitCsvLine(headerLine).map(normalizeHeader);
  const indexes = aircraftCsvColumnIndexes(headers);
  if (indexes.icao24 < 0) {
    console.error("No icao24 column found in headers");
    process.exit(1);
  }

  console.log(`Parsing ${dataLines.length} rows...`);
  const best = parseAircraftRows(dataLines, indexes);
  const sorted = [...best.entries()]
    .sort(compareAircraftIcaoEntries)
    .map(([, row]) => row.serialized);

  const ndjson = `${sorted.join("\n")}\n`;
  const outputPath = resolve(
    import.meta.dir,
    "../src/server/data/ac-db.ndjson",
  );
  await Bun.write(outputPath, ndjson);

  console.log(
    `Done: ${best.size} unique aircraft, ` +
      `${(ndjson.length / BYTES_PER_MEBIBYTE).toFixed(1)} MB -> ${outputPath}`,
  );
}

if (import.meta.main) {
  await main();
}

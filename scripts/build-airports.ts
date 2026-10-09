/**
 * Builds public/data/airports.json.gz from the OurAirports dataset (public domain,
 * https://ourairports.com/data/). Keeps airports that can be a flight origin or
 * destination: any airport with an IATA code, plus medium and large airports.
 *
 *   bun run scripts/build-airports.ts                 # downloads airports.csv
 *   bun run scripts/build-airports.ts ./airports.csv  # or a local .csv / .csv.gz
 *
 * Output: a gzipped JSON map of ICAO/IATA code to [lat, lon]. Commit the output file.
 */

import { resolve } from "path";
import { readTextFile, splitCsvLine, writeGzipJson } from "./staticData";

const SOURCE_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const OUTPUT_PATH = resolve(import.meta.dir, "../public/data/airports.json.gz");
const COORDINATE_SCALE = 10_000;
const LINE_SEPARATOR = "\n";
const HEADER_SEPARATOR = ",";
const HEADER_NOISE = /[^a-z0-9]/g;
const SURROUNDING_QUOTES = /^['"]|['"]$/g;

enum AirportColumn {
  Type = "type",
  Ident = "ident",
  Icao = "icaocode",
  Gps = "gpscode",
  Iata = "iatacode",
  Latitude = "latitudedeg",
  Longitude = "longitudedeg",
}

enum AirportType {
  Closed = "closed",
  Large = "large_airport",
  Medium = "medium_airport",
}

const ROUTE_AIRPORT_TYPES: ReadonlySet<string> = new Set([AirportType.Large, AirportType.Medium]);

enum AirportBuildErrorKind {
  Download = "download",
  Columns = "columns",
}

const AIRPORT_BUILD_ERROR_MESSAGE: Readonly<Record<AirportBuildErrorKind, string>> = {
  [AirportBuildErrorKind.Download]: "airports.csv download failed",
  [AirportBuildErrorKind.Columns]: "airports.csv has no latitude and longitude columns",
};

class AirportBuildError extends Error {
  constructor(readonly kind: AirportBuildErrorKind, readonly detail: string) {
    super(AIRPORT_BUILD_ERROR_MESSAGE[kind]);
    this.name = "AirportBuildError";
  }
}

type AirportCoordinate = readonly [number, number];
type AirportField = (column: AirportColumn) => string | undefined;
type RouteAirport = Readonly<{ codes: readonly string[]; coordinate: AirportCoordinate }>;

function normalizeHeader(value: string): string {
  return value.trim().replace(SURROUNDING_QUOTES, "").toLowerCase().replace(HEADER_NOISE, "");
}

function scaled(degrees: number): number {
  return Math.round(degrees * COORDINATE_SCALE) / COORDINATE_SCALE;
}

function routeAirport(field: AirportField): RouteAirport | null {
  const type = field(AirportColumn.Type) ?? "";
  const latitude = Number(field(AirportColumn.Latitude));
  const longitude = Number(field(AirportColumn.Longitude));
  if (type === AirportType.Closed || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  const icao = field(AirportColumn.Icao) || field(AirportColumn.Gps) || field(AirportColumn.Ident) || "";
  const iata = field(AirportColumn.Iata) ?? "";
  if ((!icao && !iata) || (!iata && !ROUTE_AIRPORT_TYPES.has(type))) return null;
  return {
    codes: [icao, iata].filter(Boolean).map((code) => code.toUpperCase()),
    coordinate: [scaled(latitude), scaled(longitude)],
  };
}

function airportMap(csv: string): Readonly<{ map: Record<string, AirportCoordinate>; kept: number }> {
  const [headerLine = "", ...lines] = csv.split(LINE_SEPARATOR);
  const header = splitCsvLine(headerLine).map(normalizeHeader);
  if (!header.includes(AirportColumn.Latitude) || !header.includes(AirportColumn.Longitude)) {
    throw new AirportBuildError(AirportBuildErrorKind.Columns, header.join(HEADER_SEPARATOR));
  }
  const map = new Map<string, AirportCoordinate>();
  let kept = 0;
  for (const line of lines) {
    if (!line) continue;
    const fields = splitCsvLine(line);
    const airport = routeAirport((column) => fields[header.indexOf(column)]);
    if (!airport) continue;
    for (const code of airport.codes) map.set(code, airport.coordinate);
    kept++;
  }
  return { map: Object.fromEntries(map), kept };
}

async function loadCsv(path: string | undefined): Promise<string> {
  if (path) return readTextFile(path);
  console.log(`Downloading ${SOURCE_URL} ...`);
  const response = await fetch(SOURCE_URL);
  if (!response.ok) throw new AirportBuildError(AirportBuildErrorKind.Download, String(response.status));
  return response.text();
}

if (import.meta.main) {
  try {
    const { map, kept } = airportMap(await loadCsv(process.argv[2]));
    const bytes = await writeGzipJson(OUTPUT_PATH, map);
    console.log(`airports: ${kept} kept, ${Object.keys(map).length} keys, ${bytes} bytes -> ${OUTPUT_PATH}`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

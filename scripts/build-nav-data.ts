#!/usr/bin/env bun
/**
 * Builds src/server/data/nav-data.json.gz from free FAA data (public domain):
 * NASR fixes, navaids, and airways, plus CIFP SID and STAR fix sequences.
 *
 *   unzip <cycle>_CSV.zip FIX_BASE.csv NAV_BASE.csv AWY_BASE.csv -d <dir>
 *   unzip CIFP_<cycle>.zip FAACIFP18
 *   bun run scripts/build-nav-data.ts <dir> <path to FAACIFP18>
 *
 * Commit the output file.
 */

import { resolve } from "path";
import { readTextFile, splitCsvLine, writeGzipJson } from "./staticData";
import {
  isAircraftRouteWaypoint,
  type AircraftRouteWaypoint,
} from "../src/shared/domain/aircraftDossier";
import {
  NAV_DATA_PATH,
  ProcedureTransition,
  procedureKey,
  type NavDataFile,
  type ProcedureTransitions,
} from "../src/server/api/filedRoute";

enum NasrFile {
  Fix = "FIX_BASE.csv",
  Navaid = "NAV_BASE.csv",
  Airway = "AWY_BASE.csv",
}

enum NasrColumn {
  FixId = "FIX_ID",
  NavaidId = "NAV_ID",
  Latitude = "LAT_DECIMAL",
  Longitude = "LONG_DECIMAL",
  AirwayId = "AWY_ID",
  AirwayFixes = "AIRWAY_STRING",
}

enum CifpRecord {
  Standard = "S",
  AirportSection = "P",
  Sid = "D",
  Star = "E",
}

enum CifpColumn {
  Section = 4,
  AirportStart = 6,
  AirportEnd = 10,
  Subsection = 12,
  ProcedureStart = 13,
  ProcedureEnd = 19,
  TransitionStart = 20,
  TransitionEnd = 25,
  FixStart = 29,
  FixEnd = 34,
}

const PROCEDURE_SUBSECTIONS: ReadonlySet<string> = new Set([CifpRecord.Sid, CifpRecord.Star]);

const USAGE = "usage: bun run scripts/build-nav-data.ts <extracted NASR CSV directory> <FAACIFP18 file>";
const EXIT_USAGE = 64;
const LINE_SEPARATOR = /\r?\n/;
const FIX_SEPARATOR = /\s+/;

type CsvRow = Readonly<Record<string, string>>;

async function readNasrCsv(directory: string, file: NasrFile): Promise<CsvRow[]> {
  const [header = "", ...lines] = (await readTextFile(resolve(directory, file)))
    .split(LINE_SEPARATOR);
  const columns = splitCsvLine(header);
  return lines.filter(Boolean).map((line) => {
    const fields = splitCsvLine(line);
    return Object.fromEntries(columns.map((column, index) => [column, fields[index] ?? ""]));
  });
}

function addFixes(
  fixes: Map<string, AircraftRouteWaypoint[]>,
  rows: readonly CsvRow[],
  idColumn: NasrColumn,
): void {
  for (const row of rows) {
    const id = row[idColumn];
    const point = [Number(row[NasrColumn.Latitude]), Number(row[NasrColumn.Longitude])];
    if (!id || !isAircraftRouteWaypoint(point)) continue;
    fixes.set(id, [...(fixes.get(id) ?? []), point]);
  }
}

function airwaySequences(rows: readonly CsvRow[]): Map<string, string[][]> {
  const airways = new Map<string, string[][]>();
  for (const row of rows) {
    const id = row[NasrColumn.AirwayId];
    const fixes = (row[NasrColumn.AirwayFixes] ?? "").split(FIX_SEPARATOR).filter(Boolean);
    if (!id || fixes.length === 0) continue;
    airways.set(id, [...(airways.get(id) ?? []), fixes]);
  }
  return airways;
}

function isProcedureLeg(line: string): boolean {
  return line.startsWith(CifpRecord.Standard) &&
    line.charAt(CifpColumn.Section) === CifpRecord.AirportSection &&
    PROCEDURE_SUBSECTIONS.has(line.charAt(CifpColumn.Subsection));
}

function procedureTransition(line: string): string | null {
  const transition = line.slice(CifpColumn.TransitionStart, CifpColumn.TransitionEnd).trim();
  if (transition.startsWith(ProcedureTransition.RunwayPrefix)) return null;
  return transition === ProcedureTransition.AllRunways ? ProcedureTransition.Common : transition;
}

function cifpProcedures(text: string): Record<string, ProcedureTransitions> {
  const procedures = new Map<string, Map<string, string[]>>();
  for (const line of text.split(LINE_SEPARATOR)) {
    const transition = isProcedureLeg(line) ? procedureTransition(line) : null;
    const fix = line.slice(CifpColumn.FixStart, CifpColumn.FixEnd).trim();
    if (transition === null || !fix) continue;
    const key = procedureKey(
      line.slice(CifpColumn.AirportStart, CifpColumn.AirportEnd).trim(),
      line.slice(CifpColumn.ProcedureStart, CifpColumn.ProcedureEnd).trim(),
    );
    const legs = procedures.get(key) ?? new Map<string, string[]>();
    procedures.set(key, legs);
    const fixes = legs.get(transition) ?? [];
    legs.set(transition, fixes);
    if (fixes.at(-1) !== fix) fixes.push(fix);
  }
  return Object.fromEntries([...procedures].map(([key, legs]) => [key, Object.fromEntries(legs)]));
}

async function buildNavData(directory: string, cifpPath: string): Promise<NavDataFile> {
  const [fixRows, navaidRows, airwayRows, cifp] = await Promise.all([
    readNasrCsv(directory, NasrFile.Fix),
    readNasrCsv(directory, NasrFile.Navaid),
    readNasrCsv(directory, NasrFile.Airway),
    readTextFile(cifpPath),
  ]);
  const fixes = new Map<string, AircraftRouteWaypoint[]>();
  addFixes(fixes, fixRows, NasrColumn.FixId);
  addFixes(fixes, navaidRows, NasrColumn.NavaidId);
  return {
    fixes: Object.fromEntries(fixes),
    airways: Object.fromEntries(airwaySequences(airwayRows)),
    procedures: cifpProcedures(cifp),
  };
}

if (import.meta.main) {
  const [directory, cifpPath] = process.argv.slice(2);
  if (!directory || !cifpPath) {
    console.error(USAGE);
    process.exit(EXIT_USAGE);
  }
  try {
    const navData = await buildNavData(directory, cifpPath);
    const bytes = await writeGzipJson(NAV_DATA_PATH, navData);
    console.log(
      `nav data: ${Object.keys(navData.fixes).length} fixes, ` +
        `${Object.keys(navData.airways).length} airways, ` +
        `${Object.keys(navData.procedures).length} procedures, ${bytes} bytes -> ${NAV_DATA_PATH}`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

#!/usr/bin/env bun

import { Database } from "bun:sqlite";
import { unlink } from "fs/promises";
import { classifyMilitary } from "../src/server/data/militaryRules";

const DEFAULT_INPUT = "src/server/data/ac-db.ndjson";
const DEFAULT_OUTPUT = "src/server/data/ac-db.sqlite";

export enum AircraftDatabaseField {
  Icao24 = "i",
  ResolvedType = "r",
  Typecode = "tc",
  Model = "md",
  Manufacturer = "mf",
  Registration = "rg",
  Operator = "op",
  OperatorIcao = "oi",
  Category = "ca",
}

export enum AircraftDatabaseErrorKind {
  InputMissing = "input-missing",
  MalformedJson = "malformed-json",
  MissingIcao24 = "missing-icao24",
}

export class AircraftDatabaseError extends Error {
  constructor(
    readonly kind: AircraftDatabaseErrorKind,
    readonly inputPath: string,
    readonly lineNumber?: number,
  ) {
    const location =
      lineNumber === undefined ? inputPath : `${inputPath}:${lineNumber}`;
    let message: string;
    switch (kind) {
      case AircraftDatabaseErrorKind.InputMissing:
        message = `Input NDJSON not found: ${inputPath}`;
        break;
      case AircraftDatabaseErrorKind.MalformedJson:
        message = `Malformed JSON at ${location}; refusing to build`;
        break;
      case AircraftDatabaseErrorKind.MissingIcao24:
        message = `Missing icao24 (i) at ${location}; refusing to build`;
        break;
    }
    super(message);
    this.name = "AircraftDatabaseError";
  }
}

type SourceRow = Partial<Record<AircraftDatabaseField, string>>;

export type BuildResult = { records: number };

const SCHEMA_SQL = `
  CREATE TABLE aircraft (
    icao24 TEXT PRIMARY KEY,
    resolved_type TEXT NOT NULL,
    typecode TEXT,
    model TEXT,
    manufacturer_name TEXT,
    registration TEXT,
    operator TEXT,
    operator_icao TEXT,
    category_description TEXT,
    military INTEGER NOT NULL
  );
`;

const INSERT_SQL = `
  INSERT INTO aircraft (
    icao24, resolved_type, typecode, model, manufacturer_name,
    registration, operator, operator_icao, category_description, military
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

/** Build the SQLite metadata database from a compact NDJSON source. */
export async function buildAircraftDb(
  inputPath: string = DEFAULT_INPUT,
  outputPath: string = DEFAULT_OUTPUT,
): Promise<BuildResult> {
  const inputFile = Bun.file(inputPath);
  if (!(await inputFile.exists())) {
    throw new AircraftDatabaseError(
      AircraftDatabaseErrorKind.InputMissing,
      inputPath,
    );
  }

  if (await Bun.file(outputPath).exists()) {
    await unlink(outputPath);
  }

  const db = new Database(outputPath, { create: true });
  db.run("PRAGMA journal_mode=OFF;");
  db.run("PRAGMA synchronous=OFF;");
  db.run(SCHEMA_SQL);

  const insert = db.prepare(INSERT_SQL);
  const text = await inputFile.text();

  let records = 0;
  let lineNumber = 0;
  const tx = db.transaction((lines: readonly string[]) => {
    for (const line of lines) {
      lineNumber += 1;
      if (line.length === 0) {
        continue;
      }
      let row: SourceRow;
      try {
        row = JSON.parse(line) as SourceRow;
      } catch {
        throw new AircraftDatabaseError(
          AircraftDatabaseErrorKind.MalformedJson,
          inputPath,
          lineNumber,
        );
      }
      const icao24 = row[AircraftDatabaseField.Icao24];
      if (!icao24) {
        throw new AircraftDatabaseError(
          AircraftDatabaseErrorKind.MissingIcao24,
          inputPath,
          lineNumber,
        );
      }
      const military = classifyMilitary(
        icao24,
        row[AircraftDatabaseField.Typecode],
        row[AircraftDatabaseField.Operator],
      )
        ? 1
        : 0;
      insert.run(
        icao24,
        row[AircraftDatabaseField.ResolvedType] ?? "Unknown",
        row[AircraftDatabaseField.Typecode] ?? null,
        row[AircraftDatabaseField.Model] ?? null,
        row[AircraftDatabaseField.Manufacturer] ?? null,
        row[AircraftDatabaseField.Registration] ?? null,
        row[AircraftDatabaseField.Operator] ?? null,
        row[AircraftDatabaseField.OperatorIcao] ?? null,
        row[AircraftDatabaseField.Category] ?? null,
        military,
      );
      records += 1;
    }
  });

  const lines = text.split("\n");
  tx(lines);

  db.close();
  return { records };
}

if (import.meta.main) {
  const inputArg = process.argv[2] ?? DEFAULT_INPUT;
  const outputArg = process.argv[3] ?? DEFAULT_OUTPUT;
  try {
    const { records } = await buildAircraftDb(inputArg, outputArg);
    console.log(`Built ac-db.sqlite: ${records} records`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

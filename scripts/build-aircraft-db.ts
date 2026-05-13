#!/usr/bin/env bun
// ── NDJSON → SQLite metadata DB build step ─────────────────────────
// Reads src/server/data/ac-db.ndjson (the source of truth, 52 MB,
// ~617k records) and writes src/server/data/ac-db.sqlite — a
// read-only, indexed-by-icao24 SQLite database the runtime opens
// once on first lookup. Drops the ~300 MB resident heap that the
// in-memory Map version was costing per dyno.
//
// Runtime contract (mirrored in aircraftEnrichment.ts):
//   - icao24 is the primary key (lowercase, 6-hex).
//   - resolved_type is NOT NULL — defaults to "Unknown" when the
//     source row has no usable r/tc/mf/md/ca to derive a label from.
//   - military is computed at build time via classifyMilitary, baked
//     into the row as INTEGER 0/1 so runtime lookups are pure SELECT.
//
// Failure mode: any malformed NDJSON line (bad JSON, missing icao24)
// fails the build with a non-zero exit. The NDJSON in the repo is
// produced by scripts/convert-aircraft-csv.ts and is expected to be
// well-formed; a parse error here means the source is corrupt and
// silently skipping it would ship an incomplete DB.

import { Database } from "bun:sqlite";
import { unlink } from "fs/promises";
import { classifyMilitary } from "../src/server/data/militaryRules";

const DEFAULT_INPUT = "src/server/data/ac-db.ndjson";
const DEFAULT_OUTPUT = "src/server/data/ac-db.sqlite";

// ── Source-row shape (NDJSON compact-key form, mirrors
// convert-aircraft-csv.ts output: { i, r, tc, md, mf, rg, op, oi, ca }).
type SourceRow = {
  i?: string;
  r?: string;
  tc?: string;
  md?: string;
  mf?: string;
  rg?: string;
  op?: string;
  oi?: string;
  ca?: string;
};

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

/** Build the SQLite metadata DB at outputPath from the NDJSON file
 *  at inputPath. Throws on any malformed line. Caller is responsible
 *  for surfacing the error message + exit code. */
export async function buildAircraftDb(
  inputPath: string = DEFAULT_INPUT,
  outputPath: string = DEFAULT_OUTPUT,
): Promise<BuildResult> {
  const inputFile = Bun.file(inputPath);
  if (!(await inputFile.exists())) {
    throw new Error(`Input NDJSON not found: ${inputPath}`);
  }

  // Replace any prior build artifact — bun:sqlite refuses to recreate
  // a table on an existing DB unless we drop the file first.
  if (await Bun.file(outputPath).exists()) {
    await unlink(outputPath);
  }

  const db = new Database(outputPath, { create: true });
  // journal_mode=OFF + synchronous=OFF = no rollback journal, no fsyncs.
  // Build is a one-shot offline step; durability isn't a concern. The
  // resulting DB is opened read-only at runtime, so these settings only
  // affect the ~10s build window.
  db.exec("PRAGMA journal_mode=OFF;");
  db.exec("PRAGMA synchronous=OFF;");
  db.exec(SCHEMA_SQL);

  const insert = db.prepare(INSERT_SQL);
  const text = await inputFile.text();

  let records = 0;
  let lineNo = 0;
  const tx = db.transaction((lines: readonly string[]) => {
    for (const line of lines) {
      lineNo++;
      if (line.length === 0) continue;
      let row: SourceRow;
      try {
        row = JSON.parse(line) as SourceRow;
      } catch {
        throw new Error(
          `Malformed JSON at ${inputPath}:${lineNo} — refusing to build`,
        );
      }
      if (!row.i) {
        throw new Error(
          `Missing icao24 (\`i\`) at ${inputPath}:${lineNo} — refusing to build`,
        );
      }
      const military = classifyMilitary(row.i, row.tc, row.op) ? 1 : 0;
      insert.run(
        row.i,
        row.r ?? "Unknown",
        row.tc ?? null,
        row.md ?? null,
        row.mf ?? null,
        row.rg ?? null,
        row.op ?? null,
        row.oi ?? null,
        row.ca ?? null,
        military,
      );
      records++;
    }
  });

  // Split into lines once. Bun handles multi-MB strings easily; the
  // 52 MB NDJSON parses into ~617k entries without issue.
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

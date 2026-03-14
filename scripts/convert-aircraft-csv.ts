/**
 * Converts an OpenSky aircraft metadata CSV into the sorted NDJSON
 * format used by the app at runtime.
 *
 * Accepts .csv or .csv.gz — pass the path as the first argument:
 *
 *   bun run src/scripts/convert-aircraft-csv.ts src/data/ac-db.csv.gz
 *   bun run src/scripts/convert-aircraft-csv.ts ~/Downloads/aircraftDatabase.csv
 *
 * Output is written to src/data/ac-db.ndjson (commit this file).
 */

import { gunzip } from "zlib";
import { promisify } from "util";
import { resolve } from "path";

const gunzipAsync = promisify(gunzip);

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

function normalizeHeader(v: string): string {
  return v
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q: "'" | '"' | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if ((ch === '"' || ch === "'") && q === null) {
      q = ch;
      continue;
    }
    if (q !== null && ch === q) {
      if (line[i + 1] === q) {
        cur += q;
        i++;
      } else {
        q = null;
      }
      continue;
    }
    if (ch === "," && q === null) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim().replace(/^['"]|['"]$/g, ""));
}

function clean(v: string | undefined): string | undefined {
  const t = (v ?? "").trim();
  if (!t || NULLISH_TEXT.has(t.toLowerCase())) return undefined;
  return t.replace(/\u00e2\u20ac\u201d/g, "-"); // fix mojibake em-dash from bad UTF-8 handling in source CSV
}

function normIcao(v: string | undefined): string | null {
  const n = (v ?? "")
    .trim()
    .toLowerCase()
    .replace(/^['"]|['"]$/g, "");
  if (!n || !/^[0-9a-f]+$/i.test(n)) return null;
  return n.length < 6 ? n.padStart(6, "0") : n;
}

function resolveType(
  tc?: string,
  mfr?: string,
  mdl?: string,
  cat?: string,
): string {
  if (tc) return tc;
  if (mfr && mdl) return `${mfr} ${mdl}`;
  if (mdl) return mdl;
  if (cat) return cat;
  return "Unknown";
}

function score(
  tc?: string,
  mdl?: string,
  mfr?: string,
  reg?: string,
  opIcao?: string,
  cat?: string,
): number {
  let s = 0;
  if (tc) s += 6;
  if (mdl) s += 4;
  if (mfr) s += 3;
  if (reg) s += 2;
  if (opIcao) s += 2;
  if (cat) s += 1;
  return s;
}

async function main() {
  const inputArg = process.argv[2];
  if (!inputArg) {
    console.error(
      "Usage: bun run src/scripts/convert-aircraft-csv.ts <path-to-csv-or-csv.gz>",
    );
    process.exit(1);
  }

  const inputPath = resolve(inputArg);
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

  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    console.error("CSV too short");
    process.exit(1);
  }

  const hdrs = splitCsvLine(lines[0]!).map(normalizeHeader);
  const idx = {
    icao: hdrs.indexOf("icao24"),
    tc: hdrs.indexOf("typecode"),
    mdl: hdrs.indexOf("model"),
    mfr: hdrs.indexOf("manufacturername"),
    reg: hdrs.indexOf("registration"),
    op: hdrs.indexOf("operator"),
    opIcao: hdrs.indexOf("operatoricao"),
    cat: hdrs.indexOf("categorydescription"),
  };
  if (idx.icao < 0) {
    console.error("No icao24 column found in headers");
    process.exit(1);
  }

  console.log(`Parsing ${lines.length - 1} rows...`);
  const best = new Map<string, { s: number; json: string }>();

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!);
    const icao24 = normIcao(cols[idx.icao]);
    if (!icao24) continue;

    const tc = clean(cols[idx.tc]);
    const mdl = clean(cols[idx.mdl]);
    const mfr = clean(cols[idx.mfr]);
    const reg = clean(cols[idx.reg]);
    const op = clean(cols[idx.op]);
    const opIcao = clean(cols[idx.opIcao]);
    const cat = clean(cols[idx.cat]);
    const rt = resolveType(tc, mfr, mdl, cat);
    const s = score(tc, mdl, mfr, reg, opIcao, cat);

    const prev = best.get(icao24);
    if (prev && prev.s >= s) continue;

    const obj: Record<string, string> = { i: icao24, r: rt };
    if (tc) obj.tc = tc;
    if (mdl) obj.md = mdl;
    if (mfr) obj.mf = mfr;
    if (reg) obj.rg = reg;
    if (op) obj.op = op;
    if (opIcao) obj.oi = opIcao;
    if (cat) obj.ca = cat;

    best.set(icao24, { s, json: JSON.stringify(obj) });
  }

  const sorted = [...best.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, v]) => v.json);

  const ndjson = sorted.join("\n") + "\n";
  const outPath = resolve(import.meta.dir, "../src/data/ac-db.ndjson");
  await Bun.write(outPath, ndjson);

  console.log(
    `Done: ${best.size} unique aircraft, ` +
      `${(ndjson.length / 1024 / 1024).toFixed(1)} MB -> ${outPath}`,
  );
}

main();

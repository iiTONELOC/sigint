/**
 * Builds public/data/airports.json.gz from the OurAirports dataset.
 *
 * OurAirports data is released to the PUBLIC DOMAIN (https://ourairports.com/data/),
 * free to redistribute. We keep airports that can plausibly be a flight
 * origin/destination (anything with an IATA code, plus medium/large airports)
 * and drop closed fields, to keep the file small.
 *
 *   bun run scripts/build-airports.ts                 # downloads airports.csv
 *   bun run scripts/build-airports.ts ./airports.csv  # or a local .csv / .csv.gz
 *
 * Output: a gzipped JSON map of ICAO/IATA code → [lat, lon]. The client fetches
 * it and decodes with DecompressionStream("gzip") — the same gzip transport the
 * cache layer (storageService) already uses. Commit the output file.
 */

import { gzip, gunzip } from "zlib";
import { promisify } from "util";
import { resolve } from "path";

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const SOURCE_URL =
  "https://davidmegginson.github.io/ourairports-data/airports.csv";

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

async function loadCsv(arg?: string): Promise<string> {
  if (arg) {
    const file = Bun.file(arg);
    if (arg.endsWith(".gz")) {
      const buf = await file.arrayBuffer();
      return (await gunzipAsync(Buffer.from(buf))).toString("utf-8");
    }
    return await file.text();
  }
  console.log(`Downloading ${SOURCE_URL} ...`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return await res.text();
}

async function main() {
  const csv = await loadCsv(process.argv[2]);
  const lines = csv.split("\n");
  const header = splitCsvLine(lines[0] ?? "").map(normalizeHeader);
  const col = (name: string) => header.indexOf(name);

  const iType = col("type");
  const iIdent = col("ident");
  const iIcao = col("icaocode");
  const iGps = col("gpscode");
  const iIata = col("iatacode");
  const iLat = col("latitudedeg");
  const iLon = col("longitudedeg");
  if (iLat < 0 || iLon < 0) {
    throw new Error(`lat/lon columns not found in header: ${header.join(",")}`);
  }

  const map: Record<string, [number, number]> = {};
  let kept = 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const f = splitCsvLine(line);
    const type = f[iType] ?? "";
    if (type === "closed") continue;

    const lat = Number(f[iLat]);
    const lon = Number(f[iLon]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const icao =
      (iIcao >= 0 ? f[iIcao] : "") ||
      (iGps >= 0 ? f[iGps] : "") ||
      (iIdent >= 0 ? f[iIdent] : "") ||
      "";
    const iata = iIata >= 0 ? f[iIata]! : "";
    if (!icao && !iata) continue;
    // Compact: only airports that realistically appear as an origin/dest.
    if (!iata && type !== "large_airport" && type !== "medium_airport") continue;

    const coord: [number, number] = [
      Math.round(lat * 1e4) / 1e4,
      Math.round(lon * 1e4) / 1e4,
    ];
    if (icao) map[icao.toUpperCase()] = coord;
    if (iata) map[iata.toUpperCase()] = coord;
    kept++;
  }

  const json = JSON.stringify(map);
  const gz = await gzipAsync(Buffer.from(json), { level: 9 });
  const outPath = resolve(import.meta.dir, "../public/data/airports.json.gz");
  await Bun.write(outPath, gz);
  console.log(
    `airports: ${kept} kept, ${Object.keys(map).length} keys — ` +
      `${(json.length / 1024 / 1024).toFixed(1)} MB JSON → ${(gz.length / 1024).toFixed(0)} KB gz`,
  );
  console.log(`→ ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

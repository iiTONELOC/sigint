#!/usr/bin/env bun
/**
 * Downloads Natural Earth 50m land GeoJSON to public/data/ for runtime serving.
 *
 * Usage:  bun run scripts/fetch-hd-land.ts
 * Output: public/data/ne_50m_land.json
 */

import { resolve } from "path";
import { mkdir } from "fs/promises";

const GEOJSON_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson";

const OUT_DIR = resolve(import.meta.dir, "../public/data");
const OUT_PATH = resolve(OUT_DIR, "ne_50m_land.json");

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log("Fetching Natural Earth 50m land data...");
  const res = await fetch(GEOJSON_URL);

  if (!res.ok) {
    console.error(`Failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const raw = await res.text();
  await Bun.write(OUT_PATH, raw);

  const sizeKB = (raw.length / 1024).toFixed(1);
  console.log(`Written to ${OUT_PATH} (${sizeKB} KB)`);
}

main();

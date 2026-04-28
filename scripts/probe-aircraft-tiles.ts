#!/usr/bin/env bun
// One-shot diagnostic for the aircraft tile coverage audit.
// Iterates AIRCRAFT_TILES at the same 3-second cadence the live
// sweep uses and records per-tile aircraft count over N passes.
// Drop this script before commit — the tile change itself is the
// permanent artefact.
//
// Usage: bun run scripts/probe-aircraft-tiles.ts <passCount>
//
// Default 2 passes. With 113 tiles × 3 s = ~6 min/pass + a 30 s
// inter-pass gap to give the rate limiter slack. 2 passes is the
// minimum to see between-pass variance; bump to 4 if the dev box's
// adsb.fi bucket holds.

import {
  AIRCRAFT_TILES,
  ADSB_BASE_URL,
  USER_AGENT,
  TILE_RADIUS_NM,
} from "../src/server/api/aircraftCache";

const PASS_COUNT = Math.max(1, parseInt(process.argv[2] ?? "2", 10));
const TILE_SPACING_MS = 3000;
const INTERPASS_GAP_MS = 30_000;

type Sample = {
  tile: readonly [number, number];
  pass: number;
  count: number | null;
  status: number;
};

const samples: Sample[] = [];

for (let pass = 0; pass < PASS_COUNT; pass++) {
  const passStart = new Date().toISOString();
  console.log(`=== pass ${pass + 1}/${PASS_COUNT} starting ${passStart} ===`);
  let rateLimitedThisPass = 0;
  for (let i = 0; i < AIRCRAFT_TILES.length; i++) {
    const [lat, lon] = AIRCRAFT_TILES[i]!;
    const url = `${ADSB_BASE_URL}/lat/${lat}/lon/${lon}/dist/${TILE_RADIUS_NM}`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });
      if (res.status === 200) {
        const json = (await res.json()) as { ac?: unknown[] };
        const count = Array.isArray(json.ac) ? json.ac.length : 0;
        samples.push({ tile: [lat, lon] as const, pass, count, status: 200 });
      } else {
        samples.push({
          tile: [lat, lon] as const,
          pass,
          count: null,
          status: res.status,
        });
        if (res.status === 429) rateLimitedThisPass++;
      }
    } catch (err) {
      samples.push({
        tile: [lat, lon] as const,
        pass,
        count: null,
        status: 0,
      });
      console.warn(
        `  tile ${i} [${lat},${lon}] error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (i < AIRCRAFT_TILES.length - 1) {
      await new Promise((r) => setTimeout(r, TILE_SPACING_MS));
    }
  }
  console.log(
    `  pass ${pass + 1}: 429 count = ${rateLimitedThisPass}/${AIRCRAFT_TILES.length}`,
  );
  if (pass < PASS_COUNT - 1) {
    await new Promise((r) => setTimeout(r, INTERPASS_GAP_MS));
  }
}

// ── Aggregate per-tile mean count ──────────────────────────────────

type TileStat = {
  tile: readonly [number, number];
  mean: number;
  min: number;
  max: number;
  samples: number;
  rateLimits: number;
};

const byTile = new Map<string, TileStat>();
for (const s of samples) {
  const key = `${s.tile[0]},${s.tile[1]}`;
  const cur = byTile.get(key) ?? {
    tile: s.tile,
    mean: 0,
    min: Number.POSITIVE_INFINITY,
    max: -1,
    samples: 0,
    rateLimits: 0,
  };
  if (s.status === 429) cur.rateLimits++;
  if (s.count === null) {
    byTile.set(key, cur);
    continue;
  }
  cur.mean = (cur.mean * cur.samples + s.count) / (cur.samples + 1);
  cur.min = Math.min(cur.min, s.count);
  cur.max = Math.max(cur.max, s.count);
  cur.samples += 1;
  byTile.set(key, cur);
}

const sorted = Array.from(byTile.values()).sort((a, b) => a.mean - b.mean);

console.log(`\n=== per-tile counts (sorted by mean asc) ===`);
console.log(`tile               mean    min    max  samples  429`);
for (const s of sorted) {
  const lat = s.tile[0].toString().padStart(4);
  const lon = s.tile[1].toString().padStart(5);
  const mean = s.mean.toFixed(1).padStart(7);
  const min = (s.min === Number.POSITIVE_INFINITY ? "—" : String(s.min)).padStart(5);
  const max = (s.max === -1 ? "—" : String(s.max)).padStart(5);
  const samp = String(s.samples).padStart(7);
  const rl = String(s.rateLimits).padStart(3);
  console.log(`[${lat},${lon}]   ${mean}  ${min}  ${max}  ${samp}  ${rl}`);
}

// Dead-tile threshold from the prompt: mean count < 5.
const dead = sorted.filter((s) => s.samples > 0 && s.mean < 5);
console.log(`\n=== dead tiles (mean < 5 with at least one good sample) — ${dead.length} ===`);
for (const s of dead) {
  console.log(`  [${s.tile[0]},${s.tile[1]}] mean=${s.mean.toFixed(1)}`);
}

const noData = sorted.filter((s) => s.samples === 0);
console.log(`\n=== tiles with zero successful samples — ${noData.length} ===`);
for (const s of noData) {
  console.log(`  [${s.tile[0]},${s.tile[1]}] 429count=${s.rateLimits}`);
}

console.log(
  `\n=== summary === passes=${PASS_COUNT} tiles=${AIRCRAFT_TILES.length} totalSamples=${samples.length} dead=${dead.length} noData=${noData.length}`,
);

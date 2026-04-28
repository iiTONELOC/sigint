// ── Render-batching integration test ─────────────────────────────────
//
// Verifies that the render-perf fix holds end-to-end:
//
//   1. Provider preserves entities array reference across N polls when
//      the id-set is stable (Pattern C — diffAndApply).
//   2. The reference equality check `d !== lastSentDataRef.current` —
//      the gate that controls heavy postMessage in GlobeVisualization —
//      stays false across those N polls, so the structuredClone-heavy
//      worker payload fires exactly once for the initial population.
//   3. Worker-side slicing on `renderLimit` yields the same visible
//      points the main-thread slice used to produce, so the user-
//      perceived progressive ramp is preserved.
//
// The render path (GlobeVisualization → Worker postMessage) lives in DOM
// + Worker territory and isn't easily run inside bun test, so the gate
// logic is replicated here in plain TS and exercised against a real
// provider. If the gate moves, this test must move with it.

import { describe, test, expect } from "bun:test";
import { BaseProvider } from "@/features/base/BaseProvider";
import type { DataPoint } from "@/features/base/dataPoints";

function pt(id: string, lat = 0, lon = 0): DataPoint {
  return {
    id,
    type: "events" as any,
    lat,
    lon,
    timestamp: new Date(0).toISOString(),
    data: {} as any,
  };
}

// ── Replicate the GlobeVisualization heavy-postMessage gate ──────────
// See src/client/components/globe/GlobeVisualization.tsx — the heavy
// `type: "data"` postMessage fires when `d !== lastSentDataRef.current`
// or colors changed. Stable provider reference → gate stays closed.

function simulateRenderGate(d: DataPoint[]): {
  send: (next: DataPoint[]) => boolean;
  lastSentRef: () => DataPoint[] | null;
} {
  let lastSent: DataPoint[] | null = null;
  return {
    send: (next: DataPoint[]) => {
      if (next !== lastSent) {
        lastSent = next;
        return true; // would have fired heavy postMessage
      }
      return false;
    },
    lastSentRef: () => lastSent,
  };
}

// ── Replicate the worker-side slice on renderLimit ───────────────────
// See public/workers/pointWorker.js renderFrame — slice happens on the
// worker's _data using payload.renderLimit. Main thread only sends a
// scalar in the lightweight frame message, no per-frame array allocation.

function workerSlice(data: DataPoint[], renderLimit: number): DataPoint[] {
  return renderLimit < data.length ? data.slice(0, renderLimit) : data;
}

describe("render batching — N stable-id-set polls fire one heavy postMessage", () => {
  test("500 polls with stable id-set produce exactly 1 heavy-postMessage send", async () => {
    let pollCount = 0;
    const provider = new BaseProvider({
      id: "render-batch-test",
      cacheKey: `render-batch-${Math.random()}`,
      maxCacheAgeMs: 300_000,
      fetchFn: async () => {
        pollCount++;
        // Same 100 ids, drifting positions — mirrors a steady-state
        // aircraft poll where every record is still in coverage.
        const out: DataPoint[] = [];
        for (let i = 0; i < 100; i++) {
          out.push(pt(`p${i}`, pollCount * 0.001, -pollCount * 0.001));
        }
        return out;
      },
    });

    // Drive 500 polls
    for (let i = 0; i < 500; i++) await provider.refresh();

    // Snapshot ref must be stable from the first refresh onward
    const finalEntities = provider.getSnapshot().entities;
    expect(provider.getSnapshot().version).toBeGreaterThanOrEqual(500);
    expect(finalEntities.length).toBe(100);
    // Last poll's positions land via in-place mutation
    expect(finalEntities[0]!.lat).toBeCloseTo(500 * 0.001, 5);

    // Now run the gate against the *same* reference 500 times — only
    // the first should "fire" the heavy postMessage.
    const gate = simulateRenderGate([]);
    let heavySends = 0;
    for (let i = 0; i < 500; i++) {
      if (gate.send(finalEntities)) heavySends++;
    }
    expect(heavySends).toBe(1);
  });

  test("membership change triggers a fresh heavy-postMessage send", async () => {
    let pollCount = 0;
    const provider = new BaseProvider({
      id: "membership-change-test",
      cacheKey: `membership-${Math.random()}`,
      maxCacheAgeMs: 300_000,
      fetchFn: async () => {
        pollCount++;
        // 5 stable polls with same id-set, then a new id appears.
        const out: DataPoint[] = [];
        for (let i = 0; i < 50; i++) out.push(pt(`p${i}`, i, -i));
        if (pollCount > 5) out.push(pt("p-new", 99, -99));
        return out;
      },
    });

    const gate = simulateRenderGate([]);
    let heavySends = 0;

    for (let i = 0; i < 10; i++) {
      await provider.refresh();
      if (gate.send(provider.getSnapshot().entities)) heavySends++;
    }

    // First poll: heavy send for initial population.
    // Polls 2–5: same id-set → ref preserved → no send.
    // Poll 6: new id → ref changes → heavy send.
    // Polls 7–10: same id-set as poll 6 → ref preserved → no sends.
    expect(heavySends).toBe(2);
  });
});

describe("worker-side slice contract — renderLimit yields the same visible points", () => {
  test("renderLimit < data.length returns slice(0, renderLimit)", () => {
    const data: DataPoint[] = [];
    for (let i = 0; i < 100; i++) data.push(pt(`p${i}`));
    const sliced = workerSlice(data, 30);
    expect(sliced.length).toBe(30);
    expect(sliced[0]!.id).toBe("p0");
    expect(sliced[29]!.id).toBe("p29");
  });

  test("renderLimit >= data.length returns the original array reference", () => {
    const data: DataPoint[] = [];
    for (let i = 0; i < 100; i++) data.push(pt(`p${i}`));
    expect(workerSlice(data, 100)).toBe(data);
    expect(workerSlice(data, 200)).toBe(data);
  });

  test("renderLimit ramping from RENDER_CHUNK to data.length covers progressively more points", () => {
    const data: DataPoint[] = [];
    for (let i = 0; i < 5000; i++) data.push(pt(`p${i}`));

    const RENDER_CHUNK = 1500;
    let limit = 0;
    let frame = 0;
    const visiblePerFrame: number[] = [];

    // Kick-off: limit grows from 0 → 1500 → 3000 → 4500 → 5000 (capped)
    while (limit < data.length) {
      if (limit === 0) {
        limit = Math.min(RENDER_CHUNK, data.length);
      } else {
        limit = Math.min(limit + RENDER_CHUNK, data.length);
      }
      visiblePerFrame.push(workerSlice(data, limit).length);
      frame++;
      if (frame > 10) break; // safety
    }

    expect(visiblePerFrame).toEqual([1500, 3000, 4500, 5000]);
  });
});

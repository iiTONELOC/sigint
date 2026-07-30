import { describe, test, expect } from "bun:test";
import { diffAndApply } from "@/features/base/diffEntities";
import type { DataPoint } from "@/features/base/dataPoints";

function pt(id: string, lat = 40, lon = -74, data: object = {}): DataPoint {
  return {
    id,
    type: "events" as any,
    lat,
    lon,
    timestamp: new Date(0).toISOString(),
    data: data as any,
  };
}

describe("diffAndApply", () => {
  test("null prior → identity changed, returns incoming reference", () => {
    const incoming = [pt("a"), pt("b")];
    const r = diffAndApply(null, incoming);
    expect(r.identityChanged).toBe(true);
    expect(r.entities).toBe(incoming);
  });

  test("empty prior → identity changed, returns incoming reference", () => {
    const incoming = [pt("a"), pt("b")];
    const r = diffAndApply([], incoming);
    expect(r.identityChanged).toBe(true);
    expect(r.entities).toBe(incoming);
  });

  test("different length → identity changed, returns incoming reference", () => {
    const prior = [pt("a"), pt("b")];
    const incoming = [pt("a"), pt("b"), pt("c")];
    const r = diffAndApply(prior, incoming);
    expect(r.identityChanged).toBe(true);
    expect(r.entities).toBe(incoming);
  });

  test("same length, different id-set (one swap) → identity changed", () => {
    const prior = [pt("a"), pt("b")];
    const incoming = [pt("a"), pt("c")];
    const r = diffAndApply(prior, incoming);
    expect(r.identityChanged).toBe(true);
    expect(r.entities).toBe(incoming);
  });

  test("same id-set + new positions → identity preserved, items mutated in place", () => {
    const prior = [pt("a", 10, -10, { v: 1 }), pt("b", 20, -20, { v: 2 })];
    const priorA = prior[0]!;
    const priorB = prior[1]!;
    const incoming = [
      pt("a", 11, -11, { v: 11 }),
      pt("b", 22, -22, { v: 22 }),
    ];
    const r = diffAndApply(prior, incoming);
    expect(r.identityChanged).toBe(false);
    expect(r.entities).toBe(prior); // array ref preserved
    // Item refs preserved too
    expect(r.entities[0]).toBe(priorA);
    expect(r.entities[1]).toBe(priorB);
    // Fields were mutated in place
    expect(priorA.lat).toBe(11);
    expect(priorA.lon).toBe(-11);
    expect((priorA.data as any).v).toBe(11);
    expect(priorB.lat).toBe(22);
    expect(priorB.lon).toBe(-22);
    expect((priorB.data as any).v).toBe(22);
  });

  test("same id-set, different order in incoming → still identity preserved, fields apply by id", () => {
    const prior = [pt("a", 10, -10), pt("b", 20, -20)];
    const priorA = prior[0]!;
    const priorB = prior[1]!;
    const incoming = [pt("b", 222, -222), pt("a", 111, -111)];
    const r = diffAndApply(prior, incoming);
    expect(r.identityChanged).toBe(false);
    expect(r.entities).toBe(prior);
    // Prior order preserved
    expect(r.entities[0]).toBe(priorA);
    expect(r.entities[1]).toBe(priorB);
    expect(priorA.lat).toBe(111);
    expect(priorB.lat).toBe(222);
  });

  test("data field is replaced wholesale (object identity matches incoming.data)", () => {
    const prior = [pt("a", 0, 0, { stale: true })];
    const incomingData = { fresh: true, callsign: "UAL1" };
    const incoming = [pt("a", 1, 1, incomingData)];
    const r = diffAndApply(prior, incoming);
    expect(r.identityChanged).toBe(false);
    expect(prior[0]!.data).toBe(incomingData);
  });

  test("repeated diff with stable id-set keeps the same array reference indefinitely", () => {
    const original = [pt("a"), pt("b"), pt("c")];
    let working = original;
    for (let i = 0; i < 10; i++) {
      const incoming = [
        pt("a", i, -i),
        pt("b", i + 1, -(i + 1)),
        pt("c", i + 2, -(i + 2)),
      ];
      const r = diffAndApply(working, incoming);
      expect(r.identityChanged).toBe(false);
      expect(r.entities).toBe(original);
      working = r.entities;
    }
    // After 10 in-place updates, original still holds the latest values
    expect(original[2]!.lat).toBe(11);
  });
});

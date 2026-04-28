import { describe, test, expect } from "bun:test";
import { normalizeIcao24 } from "../../../../../src/client/features/tracking/aircraft/lib/utils";

// ── normalizeIcao24 — input cleanup for live ADS-B records ────────
// Ported verbatim from tests/server/aircraftMetadata.spec.ts (now
// deleted) so the real exported function in
// src/client/features/tracking/aircraft/lib/utils.ts has unit-test
// coverage. The prior spec inlined a copy of the function and tested
// its own copy — the production function had zero direct tests.

describe("normalizeIcao24", () => {
  test("lowercases", () => {
    expect(normalizeIcao24("ABC123")).toBe("abc123");
  });
  test("pads short hex", () => {
    expect(normalizeIcao24("abc")).toBe("000abc");
  });
  test("trims whitespace", () => {
    expect(normalizeIcao24("  abc123  ")).toBe("abc123");
  });
  test("strips quotes", () => {
    expect(normalizeIcao24("'abc123'")).toBe("abc123");
  });
  test("rejects non-hex", () => {
    expect(normalizeIcao24("xyz123")).toBeNull();
  });
  test("rejects empty", () => {
    expect(normalizeIcao24("")).toBeNull();
  });
  test("rejects undefined", () => {
    expect(normalizeIcao24(undefined)).toBeNull();
  });
});

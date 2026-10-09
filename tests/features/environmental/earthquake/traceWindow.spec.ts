import { describe, expect, test } from "bun:test";
import { traceWindowEndMs } from "@/features/environmental/earthquake/data/waveform";

const ORIGIN = "2026-10-09T17:56:06.000Z";
const SECONDS_AFTER_ORIGIN = 220_000;

describe("traceWindowEndMs", () => {
  test("ends 220 seconds after the origin: a 240 second window that starts 20 seconds early", () => {
    expect(traceWindowEndMs(ORIGIN)).toBe(Date.parse(ORIGIN) + SECONDS_AFTER_ORIGIN);
  });

  test("returns null for an unreadable origin time", () => {
    expect(traceWindowEndMs("not a time")).toBeNull();
  });
});

import { describe, test, expect } from "bun:test";
import {
  AIRCRAFT_RECON_PROFILES,
  classifyRecon,
} from "@shared/domain/aircraft";

describe("classifyRecon", () => {
  test("flags every hex in the recon fleet", () => {
    for (const profile of Object.values(AIRCRAFT_RECON_PROFILES)) {
      for (const hex of profile.icao24) {
        expect(classifyRecon(hex)).toBe(true);
      }
    }
  });

  test("is case-insensitive on the input hex", () => {
    expect(classifyRecon("a4fac3")).toBe(true); // NOAA N42RF, lowercase
    expect(classifyRecon("A4FAC3")).toBe(true);
    expect(classifyRecon("ae0111")).toBe(true); // USAF WC-130J, lowercase
  });

  test("does not flag non-recon aircraft", () => {
    expect(classifyRecon("a12345")).toBe(false); // arbitrary civilian
    expect(classifyRecon("AE0200")).toBe(false); // US-mil range but not recon
    expect(classifyRecon("000000")).toBe(false);
  });

  test("handles empty / missing hex safely", () => {
    expect(classifyRecon("")).toBe(false);
  });

  test("covers the full known fleet (12 airframes)", () => {
    expect(
      Object.values(AIRCRAFT_RECON_PROFILES).flatMap(
        (profile) => profile.icao24,
      ),
    ).toHaveLength(12);
  });
});

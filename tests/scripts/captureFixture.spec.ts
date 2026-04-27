import { describe, test, expect } from "bun:test";
import { SOURCES, sanitizeLabel } from "../../scripts/capture-fixture";

// ── SOURCES allowlist ───────────────────────────────────────────────

describe("scripts/capture-fixture: SOURCES allowlist", () => {
  test("exposes every expected source id", () => {
    expect(Object.keys(SOURCES).sort()).toEqual(
      [
        "aircraft",
        "cyclones",
        "earthquake",
        "events",
        "fires",
        "ships",
        "weather",
      ].sort(),
    );
  });

  test("cyclones source points at NHC CurrentStorms.json with sigint User-Agent", () => {
    expect(SOURCES.cyclones?.url).toBe(
      "https://www.nhc.noaa.gov/CurrentStorms.json",
    );
    expect(SOURCES.cyclones?.headers?.["User-Agent"]).toContain("sigint");
    expect(SOURCES.cyclones?.headers?.["Accept"]).toBe("application/json");
    expect(SOURCES.cyclones?.needsAuth).toBeFalsy();
  });

  test("server-protected sources are flagged needsAuth", () => {
    expect(SOURCES.ships?.needsAuth).toBe(true);
    expect(SOURCES.events?.needsAuth).toBe(true);
    expect(SOURCES.fires?.needsAuth).toBe(true);
  });

  test("weather source carries NWS-required User-Agent and geo+json Accept", () => {
    expect(SOURCES.weather?.headers?.["User-Agent"]).toContain("sigint");
    expect(SOURCES.weather?.headers?.["Accept"]).toBe("application/geo+json");
  });

  test("earthquake source points at USGS all_week feed", () => {
    expect(SOURCES.earthquake?.url).toContain("earthquake.usgs.gov");
    expect(SOURCES.earthquake?.url).toContain("all_week");
  });
});

// ── sanitizeLabel — A04 path-injection guard ────────────────────────

describe("scripts/capture-fixture: sanitizeLabel()", () => {
  test("accepts plain alphanumeric and dash labels", () => {
    expect(sanitizeLabel("snapshot-2026-04-26")).toBe("snapshot-2026-04-26");
    expect(sanitizeLabel("live")).toBe("live");
    expect(sanitizeLabel("single-cat3")).toBe("single-cat3");
  });

  test("accepts up to 64 characters", () => {
    const max64 = "a" + "b".repeat(63);
    expect(max64.length).toBe(64);
    expect(sanitizeLabel(max64)).toBe(max64);
  });

  test("rejects path traversal sequences", () => {
    expect(sanitizeLabel("../etc/passwd")).toBeNull();
    expect(sanitizeLabel("..")).toBeNull();
    expect(sanitizeLabel("/absolute/path")).toBeNull();
    expect(sanitizeLabel("foo/bar")).toBeNull();
    expect(sanitizeLabel("foo\\bar")).toBeNull();
  });

  test("rejects whitespace and shell-special characters", () => {
    expect(sanitizeLabel("with spaces")).toBeNull();
    expect(sanitizeLabel("foo;bar")).toBeNull();
    expect(sanitizeLabel("foo$bar")).toBeNull();
    expect(sanitizeLabel("foo`bar")).toBeNull();
    expect(sanitizeLabel("foo|bar")).toBeNull();
  });

  test("rejects empty input and over-length input", () => {
    expect(sanitizeLabel("")).toBeNull();
    expect(sanitizeLabel("a".repeat(65))).toBeNull();
  });

  test("rejects labels starting with a dash", () => {
    expect(sanitizeLabel("-leading-dash")).toBeNull();
  });

  test("rejects null bytes", () => {
    expect(sanitizeLabel("foo\0bar")).toBeNull();
  });
});

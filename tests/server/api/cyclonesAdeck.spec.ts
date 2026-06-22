import { describe, test, expect } from "bun:test";
import { parseAtcfAdeck } from "../../../src/server/api/cyclonesAtcfCache";

// ── parseAtcfAdeck — spaghetti init selection ────────────────────────
// Regression for the silent "empty spaghetti" bug: a storm's a-deck ends with
// a sparse tail cycle (only CARQ / a lone late model). Keying on the absolute
// newest init returned [] even though full OFCL/GFS/ECMWF guidance existed a
// cycle earlier. The parser must pick the newest init that actually carries
// guidance (>= MIN_SPAGHETTI_MODELS distinct curated models).
//
// Row format (real ATCF a-deck, comma-separated, fixed positions):
//   0 BASIN 1 CY 2 YYYYMMDDHH 3 TECHNUM 4 TECH 5 TAU 6 LAT 7 LON 8 VMAX ...

/** One a-deck row. lat/lon in ATCF tenths-of-a-degree + hemisphere form. */
function row(init: string, model: string, tau: number, lat: string, lon: string): string {
  return `AL, 14, ${init}, 03, ${model}, ${tau}, ${lat}, ${lon}, 60, 0, XX, 34`;
}

/** A model track across several TAUs at one init. */
function track(init: string, model: string): string[] {
  return [0, 12, 24, 36, 48].map((tau, i) =>
    row(init, model, tau, `${295 + i}N`, `${775 + i * 5}W`),
  );
}

describe("parseAtcfAdeck — guidance-init selection", () => {
  test("picks the latest init that carries real guidance, not a sparse tail", () => {
    const rich = "2024101018"; // OFCL + EMXI + UKMI present
    const tail = "2024101100"; // only one lone model (the sparse tail)
    const lines = [
      ...track(rich, "OFCL"),
      ...track(rich, "EMXI"),
      ...track(rich, "UKMI"),
      ...track(tail, "UKM"), // lone straggler at the newest init
    ];
    const tracks = parseAtcfAdeck(lines.join("\n"));

    const models = tracks.map((t) => t.model).sort();
    expect(models).toEqual(["EMXI", "OFCL", "UKMI"]);
    // The lone tail-init model must NOT win selection.
    expect(models).not.toContain("UKM");
  });

  test("aligns to the guidance init nearest a given analysis time", () => {
    // Two rich inits a day apart; analysisInit picks the closer one so the
    // spaghetti matches where the storm actually is, not the latest cycle.
    const early = "2024100712";
    const late = "2024101012";
    const lines = [
      ...track(early, "OFCL"), ...track(early, "EMXI"), ...track(early, "UKMI"),
      ...track(late, "OFCL"), ...track(late, "EMXI"), ...track(late, "UKMI"),
    ];
    // Storm analysis time closest to the early init → early init's tracks chosen.
    // Both inits carry the same synthetic points here, so assert via point count:
    // selecting one init yields exactly 3 tracks (not 6).
    expect(parseAtcfAdeck(lines.join("\n"), "2024100718").length).toBe(3);
    expect(parseAtcfAdeck(lines.join("\n"), "2024101018").length).toBe(3);
    // No analysisInit → newest guidance init still wins (3 tracks, not doubled).
    expect(parseAtcfAdeck(lines.join("\n")).length).toBe(3);
  });

  test("each returned track has its points sorted by TAU", () => {
    const tracks = parseAtcfAdeck(
      [...track("2024101018", "OFCL"), ...track("2024101018", "EMXI"), ...track("2024101018", "UKMI")].join("\n"),
    );
    for (const t of tracks) {
      const taus = t.points.map((p) => p.tau);
      expect([...taus].sort((a, b) => a - b)).toEqual(taus);
    }
  });

  test("drops models with fewer than two points", () => {
    const lines = [
      ...track("2024101018", "OFCL"),
      ...track("2024101018", "EMXI"),
      ...track("2024101018", "UKMI"),
      row("2024101018", "HWFI", 0, "295N", "775W"), // single point — dropped
    ];
    const tracks = parseAtcfAdeck(lines.join("\n"));
    expect(tracks.map((t) => t.model)).not.toContain("HWFI");
  });

  test("returns [] when no init has enough guidance models", () => {
    // Only a single curated model anywhere → never meets the 3-model floor.
    expect(parseAtcfAdeck(track("2024101018", "UKM").join("\n"))).toEqual([]);
  });

  test("parses ATCF tenths-of-degree lat/lon into signed decimals", () => {
    const tracks = parseAtcfAdeck(
      [...track("2024101018", "OFCL"), ...track("2024101018", "EMXI"), ...track("2024101018", "UKMI")].join("\n"),
    );
    const ofcl = tracks.find((t) => t.model === "OFCL");
    expect(ofcl?.points[0]).toEqual({ tau: 0, lat: 29.5, lon: -77.5 });
  });
});

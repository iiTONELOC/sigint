import { describe, test, expect } from "bun:test";
import { CycloneBasin } from "@shared/cyclonesSeason";
import { buildCycloneDetailRows } from "@/features/environmental/cyclones/detailRows";
import {
  Category,
  SaffirSimpson,
  type CycloneData,
} from "@/features/environmental/cyclones/types";

function makeData(overrides: Partial<CycloneData> = {}): CycloneData {
  return {
    stormId: "AL052026",
    name: "STORM_TEST_C5",
    basin: CycloneBasin.Atlantic,
    classification: Category.Hurricane5,
    saffirSimpson: SaffirSimpson.Cat5,
    maxWindKt: 145,
    minPressureMb: 918,
    movementDir: 290,
    movementSpeedKt: 9,
    advisoryNumber: "18B",
    lastUpdate: "2026-10-08T21:00:00Z",
    forecast: [],
    ...overrides,
  };
}

describe("buildCycloneDetailRows", () => {
  test("returns label/value tuples", () => {
    const rows = buildCycloneDetailRows(makeData());
    for (const row of rows) {
      expect(row).toHaveLength(2);
      expect(typeof row[0]).toBe("string");
      expect(typeof row[1]).toBe("string");
    }
  });

  test("includes the storm name", () => {
    const rows = buildCycloneDetailRows(makeData());
    const flat = rows.map((r) => r.join("|")).join("\n");
    expect(flat).toContain("STORM_TEST_C5");
  });

  test("includes wind speed in knots and mph", () => {
    const rows = buildCycloneDetailRows(makeData());
    const winds = rows.find((r) => r[0].toLowerCase().includes("wind"));
    expect(winds).toBeDefined();
    expect(winds?.[1]).toContain("145");
    expect(winds?.[1]).toContain("kn");
    expect(winds?.[1]).toContain("167"); // 145 * 1.15078 ≈ 167 mph
  });

  test("includes pressure when present", () => {
    const rows = buildCycloneDetailRows(makeData({ minPressureMb: 918 }));
    const pressure = rows.find((r) => r[0].toLowerCase().includes("pressure"));
    expect(pressure?.[1]).toContain("918");
  });

  test("omits pressure when missing", () => {
    const rows = buildCycloneDetailRows(makeData({ minPressureMb: undefined }));
    const pressure = rows.find((r) => r[0].toLowerCase().includes("pressure"));
    expect(pressure).toBeUndefined();
  });

  test("includes movement when both direction and speed are present", () => {
    const rows = buildCycloneDetailRows(makeData());
    const move = rows.find((r) => r[0].toLowerCase().includes("movement"));
    expect(move?.[1]).toContain("290");
    expect(move?.[1]).toContain("9");
  });

  test("omits movement when direction is missing", () => {
    const rows = buildCycloneDetailRows(makeData({ movementDir: undefined }));
    const move = rows.find((r) => r[0].toLowerCase().includes("movement"));
    expect(move).toBeUndefined();
  });

  test("includes Saffir-Simpson category number for HU classifications", () => {
    const rows = buildCycloneDetailRows(makeData({ saffirSimpson: 3 }));
    const category = rows.find((r) =>
      r[0].toLowerCase().includes("category"),
    );
    expect(category?.[1]).toBe("3");
  });

  test("omits category for sub-HU storms (saffirSimpson 0)", () => {
    const rows = buildCycloneDetailRows(
      makeData({
        saffirSimpson: SaffirSimpson.None,
        classification: Category.TropicalStorm,
      }),
    );
    const category = rows.find((r) =>
      r[0].toLowerCase().includes("category"),
    );
    expect(category).toBeUndefined();
  });

  test("includes basin and storm id", () => {
    const rows = buildCycloneDetailRows(makeData());
    const basin = rows.find((r) => r[0].toLowerCase().includes("basin"));
    const stormId = rows.find((r) => r[0].toLowerCase().includes("storm"));
    expect(basin?.[1]).toBe("AL");
    expect(stormId?.[1]).toBe("AL052026");
  });

  test("includes issued timestamp when provided", () => {
    const rows = buildCycloneDetailRows(
      makeData(),
      "2026-10-08T21:00:00Z",
    );
    const issued = rows.find((r) => r[0].toLowerCase().includes("issued"));
    expect(issued).toBeDefined();
  });
});

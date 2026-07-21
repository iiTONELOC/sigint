import { describe, expect, test } from "bun:test";
import type { EarthquakePoint } from "@/features/environmental/earthquake/data/source";
import {
  EARTHQUAKE_UI_QUERY_POLICY,
  parseEarthquakeUiQuery,
  parseEarthquakeUiQueryResult,
  runEarthquakeUiQuery,
} from "@/features/environmental/earthquake/data/uiQueries";

function point(
  id: string,
  magnitude: number,
  depth: number,
  location: string,
  timestamp: string,
): EarthquakePoint {
  return {
    id,
    type: "quakes",
    lon: magnitude,
    lat: depth,
    timestamp,
    data: { magnitude, depth, location, eventType: "earthquake" },
  };
}

describe("earthquake UI queries", () => {
  test("returns a count while bounding displayed results", () => {
    const points = Array.from(
      { length: EARTHQUAKE_UI_QUERY_POLICY.searchResultLimit + 5 },
      (_, index) =>
        point(
          `Q${index}`,
          index,
          index,
          `Mexico event ${index}`,
          `2026-07-21T${String(index).padStart(2, "0")}:00:00.000Z`,
        ),
    );

    const result = runEarthquakeUiQuery(points, {
      kind: "search",
      text: "Mexico earthquake",
    });

    expect(result.kind).toBe("search");
    if (result.kind !== "search") return;
    expect(result.total).toBe(points.length);
    expect(result.items).toHaveLength(
      EARTHQUAKE_UI_QUERY_POLICY.searchResultLimit,
    );
  });

  test("filters, sorts, and pages the table without truncating its total", () => {
    const expected = point(
      "Qthree", 4, 30, "Three", "2026-07-21T12:00:00.000Z",
    );
    const points = [
      point("Qone", 2, 10, "One", "2026-07-21T10:00:00.000Z"),
      point("Qtwo", 5, 20, "Two", "2026-07-21T11:00:00.000Z"),
      expected,
    ];

    const result = runEarthquakeUiQuery(points, {
      kind: "table",
      minMagnitude: 3,
      sortKey: "value1",
      sortDirection: "desc",
      offset: 1,
      limit: 1,
    });

    expect(result).toEqual({
      kind: "table",
      total: 2,
      items: [expected],
    });
  });

  test("returns ticker and correlation windows from the complete source", () => {
    const newest = point(
      "Qnew", 5, 20, "New", "2026-07-21T12:00:00.000Z",
    );
    const middle = point(
      "Qmid", 4, 30, "Mid", "2026-07-21T11:00:00.000Z",
    );
    const points = [
      point("Qold", 2, 10, "Old", "2026-07-20T10:00:00.000Z"),
      newest,
      middle,
    ];

    expect(
      runEarthquakeUiQuery(points, { kind: "ticker", limit: 2 }),
    ).toEqual({ kind: "ticker", items: [newest, middle] });
    expect(
      runEarthquakeUiQuery(points, {
        kind: "correlation",
        since: Date.parse("2026-07-21T10:30:00.000Z"),
      }),
    ).toEqual({ kind: "correlation", items: [newest, middle] });
  });

  test("validates query and result payloads at worker boundaries", () => {
    expect(
      parseEarthquakeUiQuery({
        kind: "table",
        minMagnitude: 0,
        sortKey: "mystery",
        sortDirection: "asc",
        offset: 0,
        limit: 20,
      }),
    ).toBeNull();
    expect(
      parseEarthquakeUiQueryResult({
        kind: "ticker",
        items: [{ id: "bad" }],
      }),
    ).toBeNull();
  });
});

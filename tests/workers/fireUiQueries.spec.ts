import { describe, expect, test } from "bun:test";
import { POINT_UI_QUERY_POLICY } from "@/features/base/uiQueryPolicy";
import type { FirePoint } from "@/features/environmental/fires/data/source";
import {
  parseFireUiQuery,
  parseFireUiQueryResult,
  runFireUiQuery,
} from "@/features/environmental/fires/data/uiQueries";

function point(
  id: string,
  frp: number,
  confidence: string,
  satellite: string,
  timestamp: string,
): FirePoint {
  return {
    id,
    type: "fires",
    lon: frp,
    lat: frp / 2,
    timestamp,
    data: { frp, confidence, satellite, brightness: frp + 300 },
  };
}

describe("fire UI queries", () => {
  test("returns the complete count with a bounded search preview", () => {
    const points = Array.from(
      { length: POINT_UI_QUERY_POLICY.searchResultLimit + 5 },
      (_, index) =>
        point(
          `FI-${index}`,
          index,
          "nominal",
          `VIIRS-${index}`,
          "2026-07-21T12:00:00.000Z",
        ),
    );

    const result = runFireUiQuery(points, {
      kind: "search",
      text: "VIIRS",
    });

    expect(result.kind).toBe("search");
    if (result.kind !== "search") return;
    expect(result.total).toBe(points.length);
    expect(result.items).toHaveLength(
      POINT_UI_QUERY_POLICY.searchResultLimit,
    );
  });

  test("filters, sorts, and pages without truncating the total", () => {
    const expected = point(
      "FI-mid",
      40,
      "nominal",
      "N",
      "2026-07-21T11:00:00.000Z",
    );
    const points = [
      point("FI-low", 100, "low", "N", "2026-07-21T10:00:00.000Z"),
      point("FI-high", 80, "high", "N", "2026-07-21T12:00:00.000Z"),
      expected,
    ];

    const result = runFireUiQuery(points, {
      kind: "table",
      minValue: 1,
      sortKey: "value1",
      sortDirection: "desc",
      offset: 1,
      limit: 1,
    });

    expect(result).toEqual({ kind: "table", total: 2, items: [expected] });
  });

  test("returns the requested ticker prefix from the complete source", () => {
    const newest = point(
      "FI-new",
      50,
      "high",
      "N",
      "2026-07-21T12:00:00.000Z",
    );
    const middle = point(
      "FI-mid",
      40,
      "nominal",
      "N",
      "2026-07-21T11:00:00.000Z",
    );
    const oldest = point(
      "FI-old",
      30,
      "nominal",
      "N",
      "2026-07-21T10:00:00.000Z",
    );

    expect(
      runFireUiQuery([oldest, newest, middle], { kind: "ticker", limit: 2 }),
    ).toEqual({ kind: "ticker", items: [newest, middle] });
  });

  test("validates query and result payloads at worker boundaries", () => {
    expect(
      parseFireUiQuery({
        kind: "table",
        minValue: 4,
        sortKey: "age",
        sortDirection: "asc",
        offset: 0,
        limit: 20,
      }),
    ).toBeNull();
    expect(
      parseFireUiQueryResult({ kind: "ticker", items: [{ id: "bad" }] }),
    ).toBeNull();
  });
});

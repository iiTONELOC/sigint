// ── Synthesize forecast points as DataPoints ─────────────────────
// Each cyclone's NHC-published forecast track lives nested in
// CycloneData.forecast. To make those points clickable through the
// existing hit-test/selection pipeline (instead of building a separate
// click handler in the worker), we explode them into pseudo-DataPoints
// of type "cyclones-forecast". These are derived state — not persisted.
//
// The parent* fields let the mini-dossier identify the originating
// storm and offer a "JUMP TO STORM" action without re-walking allData.

import type { DataPoint } from "@/features/base/dataPoints";
import type { CycloneData } from "../types";

export function synthesizeForecastPoints(
  data: ReadonlyArray<DataPoint>,
): DataPoint[] {
  const out: DataPoint[] = [];
  for (const c of data) {
    if (c.type !== "cyclones") continue;
    const parent: CycloneData = c.data;
    const forecast = Array.isArray(parent.forecast) ? parent.forecast : [];
    for (const fp of forecast) {
      out.push({
        id: `CYF${parent.stormId}-H${fp.fcstHour}`,
        type: "cyclones-forecast",
        lat: fp.lat,
        lon: fp.lon,
        timestamp: fp.validTime,
        data: {
          parentStormId: parent.stormId,
          parentName: parent.name,
          parentBasin: parent.basin,
          fcstHour: fp.fcstHour,
          validTime: fp.validTime,
          maxWindKt: fp.maxWindKt,
          minPressureMb: fp.minPressureMb,
          category: fp.category,
          saffirSimpson: parent.saffirSimpson,
          errorRadiusNm: fp.errorRadiusNm,
        },
      });
    }
  }
  return out;
}

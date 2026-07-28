import { Domain } from "@shared/domain/identity";
// Explodes each storm's forecast track into clickable "cyclones-forecast"
// pseudo-DataPoints so they flow through the normal hit-test/selection
// pipeline. Derived state — not persisted.
//
// Returns are reference-stable: an unchanged point returns the SAME object
// and an unchanged set returns the SAME array, so allData (and the render
// worker's "data" message) doesn't churn every poll.

import type { DataPoint } from "@/features/base/dataPoints";
import type { CycloneData, CycloneForecastPointData } from "../types";

type ForecastDataPoint = DataPoint & {
  type: Domain.CyclonesForecast;
  data: CycloneForecastPointData;
};

const pointCache = new Map<string, { key: string; point: ForecastDataPoint }>();
let lastSignature = "";
let lastResult: DataPoint[] = [];

type ForecastEntry = CycloneData["forecast"][number];

function contentKey(parent: CycloneData, fp: ForecastEntry): string {
  return `${parent.advisoryNumber}|${fp.lat},${fp.lon}|${fp.maxWindKt}|${fp.category}|${fp.errorRadiusNm}`;
}

function getOrBuildPoint(
  id: string,
  key: string,
  parent: CycloneData,
  fp: ForecastEntry,
): ForecastDataPoint {
  const cached = pointCache.get(id);
  if (cached?.key === key) return cached.point;
  const point: ForecastDataPoint = {
    id,
    type: Domain.CyclonesForecast,
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
  };
  pointCache.set(id, { key, point });
  return point;
}

export function synthesizeForecastPoints(
  data: ReadonlyArray<DataPoint>,
): DataPoint[] {
  const out: DataPoint[] = [];
  const liveIds = new Set<string>();
  let signature = "";

  for (const c of data) {
    if (c.type !== "cyclones") continue;
    const parent = c.data as CycloneData;
    const forecast = Array.isArray(parent.forecast) ? parent.forecast : [];
    for (const fp of forecast) {
      const id = `CYF${parent.stormId}-H${fp.fcstHour}`;
      liveIds.add(id);
      const key = contentKey(parent, fp);
      signature += `${id}#${key};`;
      out.push(getOrBuildPoint(id, key, parent, fp));
    }
  }

  for (const id of pointCache.keys()) {
    if (!liveIds.has(id)) pointCache.delete(id); // evict dissipated storms
  }

  if (signature === lastSignature) return lastResult;
  lastSignature = signature;
  lastResult = out;
  return out;
}

/** TEST-ONLY: reset the identity-stability memo between cases. */
export function __resetForecastSynthesisForTests(): void {
  pointCache.clear();
  lastSignature = "";
  lastResult = [];
}

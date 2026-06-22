// A clicked watch/warning polygon is surfaced through the normal selection +
// detail pipeline by synthesizing a DataPoint for it. The warning isn't in
// allData, so UIContext's `idMap.get(id) ?? selected` falls back to this object.

import type { DataPoint } from "@/features/base/dataPoints";
import { geometryCentroid } from "@/lib/geo/pointInPolygon";
import type { CycloneWarning } from "./warnings";

export const WARNING_TYPE = "cyclones-warning";

export function warningToDataPoint(w: CycloneWarning): DataPoint {
  const c = geometryCentroid(w.geometry) ?? { lat: 0, lon: 0 };
  return {
    id: w.id,
    type: WARNING_TYPE,
    lat: c.lat,
    lon: c.lon,
    timestamp: w.effective,
    data: w,
  } as unknown as DataPoint;
}

function fmt(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function buildWarningDetailRows(w: CycloneWarning): [string, string][] {
  const rows: [string, string][] = [
    ["Alert", w.event],
    ["Severity", w.kind === "warning" ? "WARNING" : "WATCH"],
  ];
  if (w.areaDesc) rows.push(["Area", w.areaDesc]);
  if (w.headline) rows.push(["Headline", w.headline]);
  rows.push(["Effective", fmt(w.effective)]);
  rows.push(["Expires", fmt(w.expires)]);
  return rows;
}

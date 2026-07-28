import type { DataPoint } from "@/features/base/dataPoints";
import { Domain } from "@shared/domain/identity";
import { hasPointShape, parsePointList } from "@/features/base/pointCodec";
import { isRecord } from "@shared/geo";
import type { WarningSeverity } from "./warnings";

export type CycloneWarningPoint = Extract<
  DataPoint,
  { type: Domain.CyclonesWarning }
>;

const SEVERITIES: ReadonlySet<string> = new Set<WarningSeverity>([
  "warning",
  "watch",
]);

function isWarningData(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.event === "string" &&
    typeof value.kind === "string" &&
    SEVERITIES.has(value.kind) &&
    typeof value.headline === "string" &&
    typeof value.areaDesc === "string" &&
    typeof value.effective === "string" &&
    typeof value.expires === "string" &&
    value.geometry !== undefined
  );
}

export function isCycloneWarningPoint(
  value: unknown,
): value is CycloneWarningPoint {
  return hasPointShape(value, Domain.CyclonesWarning) && isWarningData(value.data);
}

export function parseCycloneWarningCache(
  value: unknown,
): readonly CycloneWarningPoint[] | null {
  return parsePointList(value, isCycloneWarningPoint);
}

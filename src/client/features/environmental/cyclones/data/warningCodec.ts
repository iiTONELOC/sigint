import type { DataPoint } from "@/features/base/dataPoints";
import { Domain } from "@shared/domain/identity";
import {
  hasPointShape,
  isOptionalString,
  parsePointList,
} from "@/features/base/pointCodec";
import { AreaKind } from "@/workers/render/protocol";
import { isRecord, parseGeoJsonPolygonGeometry } from "@shared/geo";
import { isEnumValue } from "@shared/types/enum";

export type CycloneWarningPoint = Extract<
  DataPoint,
  { type: Domain.CyclonesWarning }
>;

const WARNING_TEXT_KEYS = [
  "id",
  "event",
  "headline",
  "areaDesc",
  "effective",
  "expires",
] as const;

function isWarningData(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isEnumValue(value.kind, AreaKind)) return false;
  if (!parseGeoJsonPolygonGeometry(value.geometry)) return false;
  return WARNING_TEXT_KEYS.every((key) => isOptionalString(value[key]));
}

export function isCycloneWarningPoint(
  value: unknown,
): value is CycloneWarningPoint {
  return (
    hasPointShape(value, Domain.CyclonesWarning) && isWarningData(value.data)
  );
}

export function parseCycloneWarningCache(
  value: unknown,
): readonly CycloneWarningPoint[] | null {
  return parsePointList(value, isCycloneWarningPoint);
}

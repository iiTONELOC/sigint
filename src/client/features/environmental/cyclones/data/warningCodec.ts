import { Domain } from "@shared/domain/identity";
import {
  isOptionalString,
  parsePointList,
} from "@/features/base/pointCodec";
import { isWeatherData } from "@/features/environmental/weather/data/codec";
import {
  AreaKind,
  type CycloneWarningData,
  type CycloneWarningPoint,
} from "@shared/domain/cyclones";
import {
  isRecord,
  parseGeoJsonPolygonGeometry,
  parseGeoPoint,
} from "@shared/geo";
import { isEnumValue } from "@shared/types/enum";

function isWarningData(value: unknown): value is CycloneWarningData {
  return (
    isRecord(value) &&
    isEnumValue(value.kind, AreaKind) &&
    parseGeoJsonPolygonGeometry(value.geometry) !== null &&
    isWeatherData(value)
  );
}

export function isCycloneWarningPoint(
  value: unknown,
): value is CycloneWarningPoint {
  return (
    isRecord(value) &&
    value.type === Domain.CyclonesWarning &&
    isOptionalString(value.id) &&
    value.id.length > 0 &&
    parseGeoPoint(value.position) !== null &&
    (value.timestamp === undefined || isOptionalString(value.timestamp)) &&
    isWarningData(value.data)
  );
}

export function parseCycloneWarningCache(
  value: unknown,
): readonly CycloneWarningPoint[] | null {
  return parsePointList(value, isCycloneWarningPoint);
}

import type { DataPoint } from "@/features/base/dataPoints";
import { Domain } from "@shared/domain/identity";
import { isNhcBasin } from "@shared/cyclonesSeason";
import {
  hasPointShape,
  parsePointList,
} from "@/features/base/pointCodec";
import {
  Category,
  SaffirSimpson,
  type CycloneData,
} from "@/features/environmental/cyclones/types";
import { isRecord } from "@shared/geo";
import { isEnumValue, isNumberEnumValue } from "@shared/types/enum";

export type CyclonePoint = Extract<DataPoint, { type: Domain.Cyclones }>;

function isOptionalArray(value: unknown): boolean {
  return value === undefined || Array.isArray(value);
}

/**
 * Validates the scalars the renderer branches on and confirms the nested
 * track collections are arrays. Their element shapes are already guarded at
 * each draw site, and this data only ever comes from our own enrichment
 * endpoint and our own IndexedDB mirror.
 */
function isCycloneData(value: unknown): value is CycloneData {
  return (
    isRecord(value) &&
    typeof value.stormId === "string" &&
    typeof value.name === "string" &&
    isNhcBasin(value.basin) &&
    isEnumValue(value.classification, Category) &&
    isNumberEnumValue(value.saffirSimpson, SaffirSimpson) &&
    typeof value.maxWindKt === "number" &&
    typeof value.advisoryNumber === "string" &&
    typeof value.lastUpdate === "string" &&
    Array.isArray(value.forecast) &&
    isOptionalArray(value.pastTrack) &&
    isOptionalArray(value.models)
  );
}

export function isCyclonePoint(value: unknown): value is CyclonePoint {
  return hasPointShape(value, Domain.Cyclones) && isCycloneData(value.data);
}

export function parseCycloneCache(
  value: unknown,
): readonly CyclonePoint[] | null {
  return parsePointList(value, isCyclonePoint);
}

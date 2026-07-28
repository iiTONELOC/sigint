import type { DataPoint } from "@/features/base/dataPoints";
import {
  hasPointShape,
  parsePointList,
} from "@/features/base/pointCodec";
import type {
  Category,
  CycloneData,
} from "@/features/environmental/cyclones/types";
import { isRecord } from "@shared/geo";

export type CyclonePoint = Extract<DataPoint, { type: "cyclones" }>;

const CATEGORIES: ReadonlySet<string> = new Set<Category>([
  "TD",
  "TS",
  "HU1",
  "HU2",
  "HU3",
  "HU4",
  "HU5",
  "STD",
  "STS",
  "PT",
]);

const BASINS: ReadonlySet<string> = new Set(["AL", "EP", "CP"]);

const MAX_SAFFIR_SIMPSON = 5;

function isCategory(value: unknown): value is Category {
  return typeof value === "string" && CATEGORIES.has(value);
}

function isSaffirSimpson(value: unknown): value is CycloneData["saffirSimpson"] {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_SAFFIR_SIMPSON
  );
}

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
    typeof value.basin === "string" &&
    BASINS.has(value.basin) &&
    isCategory(value.classification) &&
    isSaffirSimpson(value.saffirSimpson) &&
    typeof value.maxWindKt === "number" &&
    typeof value.advisoryNumber === "string" &&
    typeof value.lastUpdate === "string" &&
    Array.isArray(value.forecast) &&
    isOptionalArray(value.pastTrack) &&
    isOptionalArray(value.models)
  );
}

export function isCyclonePoint(value: unknown): value is CyclonePoint {
  return hasPointShape(value, "cyclones") && isCycloneData(value.data);
}

export function parseCycloneCache(
  value: unknown,
): readonly CyclonePoint[] | null {
  return parsePointList(value, isCyclonePoint);
}

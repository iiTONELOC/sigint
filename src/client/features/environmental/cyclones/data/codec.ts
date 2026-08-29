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
  parseCycloneStormId,
  type CycloneDossierBundle,
  type CycloneDossierProductBody,
  type CycloneDossierResult,
  type CycloneData,
} from "@shared/domain/cyclones";
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

function isDossierProduct(
  value: unknown,
): value is CycloneDossierProductBody {
  return isRecord(value) &&
    typeof value.advisoryNumber === "string" &&
    typeof value.issuedAt === "string" &&
    typeof value.body === "string" &&
    typeof value.nextAdvisory === "string";
}

function isOptionalDossierProduct(
  value: unknown,
): value is CycloneDossierProductBody | undefined {
  return value === undefined || isDossierProduct(value);
}

function isCycloneDossierBundle(
  value: unknown,
): value is CycloneDossierBundle {
  return isRecord(value) &&
    parseCycloneStormId(value.stormId) === value.stormId &&
    isOptionalDossierProduct(value.advisory) &&
    isOptionalDossierProduct(value.discussion) &&
    isOptionalDossierProduct(value.windProbs);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseCycloneDossierBundle(
  value: unknown,
): CycloneDossierBundle | null {
  return isCycloneDossierBundle(value) ? value : null;
}

export function parseCycloneDossierResult(
  value: unknown,
): CycloneDossierResult | null {
  if (!isRecord(value) || !isFiniteNumber(value.fetchedAt)) return null;
  if (value.dossier === null) return { dossier: null, fetchedAt: value.fetchedAt };
  const dossier = parseCycloneDossierBundle(value.dossier);
  return dossier ? { dossier, fetchedAt: value.fetchedAt } : null;
}

export function parseCycloneDossierCacheEntry(
  value: unknown,
): Readonly<{ bundle: CycloneDossierBundle; fetchedAt: number }> | null {
  if (!isRecord(value) || !isFiniteNumber(value.fetchedAt)) return null;
  const bundle = parseCycloneDossierBundle(value.bundle);
  return bundle ? { bundle, fetchedAt: value.fetchedAt } : null;
}

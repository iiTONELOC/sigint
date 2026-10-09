import type { DataPoint } from "@/features/base/dataPoints";
import { Domain } from "@shared/domain/identity";
import { isNhcBasin } from "@shared/cyclonesSeason";
import {
  hasPointShape,
  parsePointList,
} from "@/features/base/pointCodec";
import {
  Category,
  CycloneArrivalKind,
  CycloneThreatKind,
  CycloneThreatLevel,
  SaffirSimpson,
  parseCycloneStormId,
  type CycloneArrivalLine,
  type CycloneArrivals,
  type CycloneHazards,
  type CycloneSurgeArea,
  type CycloneThreat,
  type CycloneWindChances,
  type CycloneDossierBundle,
  type CycloneDossierProductBody,
  type CycloneDossierResult,
  type CycloneData,
} from "@shared/domain/cyclones";
import { isRecord, parseGeoPoint, type GeoPoint } from "@shared/geo";
import { isEnumValue, isNumberEnumValue } from "@shared/types/enum";

export type CyclonePoint = Extract<DataPoint, { type: Domain.Cyclones }>;

function isOptionalArray(value: unknown): boolean {
  return value === undefined || Array.isArray(value);
}

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
    isOptionalArray(value.models) &&
    (value.hazards === undefined || isHazards(value.hazards))
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

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isPointList(value: unknown): value is readonly GeoPoint[] {
  return Array.isArray(value) && value.every((point) => parseGeoPoint(point) !== null);
}

function isThreat(value: unknown): value is CycloneThreat {
  return isRecord(value) &&
    isEnumValue(value.kind, CycloneThreatKind) &&
    isEnumValue(value.level, CycloneThreatLevel) &&
    typeof value.title === "string" &&
    isStringList(value.impacts);
}

function isSurgeArea(value: unknown): value is CycloneSurgeArea {
  return isRecord(value) &&
    typeof value.area === "string" &&
    typeof value.range === "string" &&
    Array.isArray(value.rings) && value.rings.every(isPointList);
}

function isWindChances(value: unknown): value is CycloneWindChances {
  return isRecord(value) &&
    isFiniteNumber(value.thresholdKt) &&
    Array.isArray(value.bands) &&
    value.bands.every((band) =>
      isRecord(band) && typeof band.band === "string" && Array.isArray(band.rings) && band.rings.every(isPointList));
}

function isArrivalLine(value: unknown): value is CycloneArrivalLine {
  return isRecord(value) && typeof value.label === "string" && isPointList(value.line);
}

function isArrivals(value: unknown): value is CycloneArrivals {
  return isRecord(value) && Object.entries(value).every(([kind, lines]) =>
    isEnumValue(kind, CycloneArrivalKind) && Array.isArray(lines) && lines.every(isArrivalLine));
}

function isHazards(value: unknown): value is CycloneHazards {
  return isRecord(value) &&
    Array.isArray(value.threats) && value.threats.every(isThreat) &&
    Array.isArray(value.peakSurge) && value.peakSurge.every(isSurgeArea) &&
    Array.isArray(value.windChances) && value.windChances.every(isWindChances) &&
    isArrivals(value.arrival);
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

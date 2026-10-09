import type { DataPoint } from "@/features/base/dataPoints";
import {
  hasPointShape,
} from "@/features/base/pointCodec";
import {
  isCyclonePoint,
  type CyclonePoint,
} from "@/features/environmental/cyclones/data/codec";
import {
  Category,
  SaffirSimpson,
  atcfTimeMs,
  saffirSimpsonForWind,
  type CycloneForecastPointData,
  type ForecastPoint,
  type PastTrackPoint,
} from "@shared/domain/cyclones";
import { isNhcBasin } from "@shared/cyclonesSeason";
import { Domain } from "@shared/domain/identity";
import { isRecord } from "@shared/geo";
import { cycloneForecastSceneId, cyclonePastPointSceneId } from "@shared/scene";
import { isEnumValue, isNumberEnumValue } from "@shared/types/enum";

/** Bounded UI projection for one forecast scene interaction. */
export type CycloneForecastPoint = Extract<
  DataPoint,
  { type: Domain.CyclonesForecast }
>;

export type CyclonePastPoint = Extract<
  DataPoint,
  { type: Domain.CyclonesPast }
>;

function isParentPointData(value: unknown): value is Readonly<Record<string, unknown>> {
  return (
    isRecord(value) &&
    typeof value.parentEntityId === "string" &&
    typeof value.parentName === "string" &&
    isNhcBasin(value.parentBasin) &&
    typeof value.validTime === "string" &&
    typeof value.maxWindKt === "number" &&
    Number.isFinite(value.maxWindKt) &&
    (value.minPressureMb === undefined ||
      (typeof value.minPressureMb === "number" &&
        Number.isFinite(value.minPressureMb)))
  );
}

function isForecastData(
  value: unknown,
): value is CycloneForecastPointData {
  return (
    isParentPointData(value) &&
    typeof value.fcstHour === "number" &&
    Number.isFinite(value.fcstHour) &&
    isEnumValue(value.category, Category) &&
    isNumberEnumValue(value.saffirSimpson, SaffirSimpson) &&
    typeof value.errorRadiusNm === "number" &&
    Number.isFinite(value.errorRadiusNm)
  );
}

export function isCycloneForecastPoint(
  value: unknown,
): value is CycloneForecastPoint {
  return (
    hasPointShape(value, Domain.CyclonesForecast) &&
    isForecastData(value.data)
  );
}

export function isCyclonePastPoint(
  value: unknown,
): value is CyclonePastPoint {
  return (
    hasPointShape(value, Domain.CyclonesPast) &&
    isParentPointData(value.data)
  );
}

export function isCycloneSourceEntity(
  value: unknown,
): value is CyclonePoint | CycloneForecastPoint | CyclonePastPoint {
  return isCyclonePoint(value) || isCycloneForecastPoint(value) || isCyclonePastPoint(value);
}

export function cyclonePastPoint(
  cyclone: CyclonePoint,
  point: PastTrackPoint,
): CyclonePastPoint {
  const timeMs = atcfTimeMs(point.validTime);
  return {
    id: cyclonePastPointSceneId(cyclone.id, point.validTime),
    type: Domain.CyclonesPast,
    lat: point.lat,
    lon: point.lon,
    ...(Number.isFinite(timeMs) ? { timestamp: new Date(timeMs).toISOString() } : {}),
    data: {
      parentEntityId: cyclone.id,
      parentName: cyclone.data.name,
      parentBasin: cyclone.data.basin,
      validTime: point.validTime,
      maxWindKt: point.vmaxKt,
      ...(point.minPressureMb == null ? {} : { minPressureMb: point.minPressureMb }),
    },
  };
}

export function cyclonePastProjection(
  cyclone: CyclonePoint,
  sceneId: string,
): CyclonePastPoint | null {
  const point = cyclone.data.pastTrack?.find(
    (past) => cyclonePastPointSceneId(cyclone.id, past.validTime) === sceneId,
  );
  return point ? cyclonePastPoint(cyclone, point) : null;
}

export function cycloneForecastPoint(
  cyclone: CyclonePoint,
  forecast: ForecastPoint,
): CycloneForecastPoint {
  return {
    id: cycloneForecastSceneId(
      cyclone.data.stormId,
      forecast.fcstHour,
    ),
    type: Domain.CyclonesForecast,
    lat: forecast.lat,
    lon: forecast.lon,
    timestamp: forecast.validTime,
    data: {
      parentEntityId: cyclone.id,
      parentName: cyclone.data.name,
      parentBasin: cyclone.data.basin,
      fcstHour: forecast.fcstHour,
      validTime: forecast.validTime,
      maxWindKt: forecast.maxWindKt,
      ...(forecast.minPressureMb === undefined
        ? {}
        : { minPressureMb: forecast.minPressureMb }),
      category: forecast.category,
      saffirSimpson: saffirSimpsonForWind(forecast.maxWindKt),
      errorRadiusNm: forecast.errorRadiusNm,
    },
  };
}

export function cycloneForecastProjection(
  cyclone: CyclonePoint,
  sceneId: string,
): CycloneForecastPoint | null {
  for (const forecast of cyclone.data.forecast) {
    if (
      cycloneForecastSceneId(
        cyclone.data.stormId,
        forecast.fcstHour,
      ) === sceneId
    ) {
      return cycloneForecastPoint(cyclone, forecast);
    }
  }
  return null;
}

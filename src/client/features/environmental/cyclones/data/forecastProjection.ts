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
  type CycloneForecastPointData,
  type ForecastPoint,
} from "@/features/environmental/cyclones/types";
import {
  cycloneForecastSceneId,
} from "@/workers/render/scene/cycloneSchema";
import { isNhcBasin } from "@shared/cyclonesSeason";
import { Domain } from "@shared/domain/identity";
import { isRecord } from "@shared/geo";
import { isEnumValue, isNumberEnumValue } from "@shared/types/enum";

/** Bounded UI projection for one forecast scene interaction. */
export type CycloneForecastPoint = Extract<
  DataPoint,
  { type: Domain.CyclonesForecast }
>;

function isForecastData(
  value: unknown,
): value is CycloneForecastPointData {
  return (
    isRecord(value) &&
    typeof value.parentStormId === "string" &&
    typeof value.parentName === "string" &&
    isNhcBasin(value.parentBasin) &&
    typeof value.fcstHour === "number" &&
    Number.isFinite(value.fcstHour) &&
    typeof value.validTime === "string" &&
    typeof value.maxWindKt === "number" &&
    Number.isFinite(value.maxWindKt) &&
    (value.minPressureMb === undefined ||
      (typeof value.minPressureMb === "number" &&
        Number.isFinite(value.minPressureMb))) &&
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

export function isCycloneSourceEntity(
  value: unknown,
): value is CyclonePoint | CycloneForecastPoint {
  return isCyclonePoint(value) || isCycloneForecastPoint(value);
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
      parentStormId: cyclone.data.stormId,
      parentName: cyclone.data.name,
      parentBasin: cyclone.data.basin,
      fcstHour: forecast.fcstHour,
      validTime: forecast.validTime,
      maxWindKt: forecast.maxWindKt,
      ...(forecast.minPressureMb === undefined
        ? {}
        : { minPressureMb: forecast.minPressureMb }),
      category: forecast.category,
      saffirSimpson: cyclone.data.saffirSimpson,
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

import { CycloneBasin } from "@shared/cyclonesSeason";
import { Domain } from "@shared/domain/identity";
import {
  Category,
  SaffirSimpson,
  type CycloneData,
  type ForecastPoint,
  type PastTrackPoint,
} from "@shared/domain/cyclones";
import type { CyclonePoint } from "@/features/environmental/cyclones/data/codec";

export const TEST_CYCLONE_FORECAST: ForecastPoint = {
  fcstHour: 24,
  validTime: "2026-09-19T00:00:00Z",
  lat: 26,
  lon: -74,
  maxWindKt: 80,
  category: Category.Hurricane1,
  errorRadiusNm: 41,
};

export const TEST_CYCLONE_PAST_TRACK: PastTrackPoint = {
  lat: 24,
  lon: -76,
  validTime: "2026-09-17T00:00:00Z",
  vmaxKt: 60,
};

export function testCyclonePoint(
  data: Partial<CycloneData> = {},
): CyclonePoint {
  return {
    id: "CYAL052026",
    type: Domain.Cyclones,
    lat: 25,
    lon: -75,
    timestamp: "2026-09-18T00:00:00Z",
    data: {
      stormId: "AL052026",
      name: "ELENA",
      basin: CycloneBasin.Atlantic,
      classification: Category.Hurricane1,
      saffirSimpson: SaffirSimpson.Cat1,
      maxWindKt: 75,
      advisoryNumber: "12",
      lastUpdate: "2026-09-18T00:00:00Z",
      forecast: [],
      ...data,
    },
  };
}

export function testCycloneScenePoint(): CyclonePoint {
  return testCyclonePoint({
    forecast: [TEST_CYCLONE_FORECAST],
    pastTrack: [
      {
        lat: 23,
        lon: -77,
        validTime: "2026-09-16T00:00:00Z",
        vmaxKt: 50,
      },
      TEST_CYCLONE_PAST_TRACK,
    ],
    windRadii: {
      lat: 25,
      lon: -75,
      vmaxKt: 75,
      validTime: "2026-09-18T00:00:00Z",
      kt34: [50, 40, 30, 40],
      kt50: null,
      kt64: null,
    },
    models: [{
      model: "OFCL",
      points: [
        { tau: 0, lat: 25, lon: -75 },
        { tau: 24, lat: 26, lon: -74 },
      ],
    }],
  });
}

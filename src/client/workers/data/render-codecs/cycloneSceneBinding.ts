import type { CyclonePoint } from "@/features/environmental/cyclones/data/codec";
import type {
  ForecastPoint,
  ModelTrack,
  PastTrackPoint,
  WindRadii,
} from "@/features/environmental/cyclones/types";
import {
  SceneBinding,
  type SceneCommandPublisher,
} from "@/workers/data/render-codecs/sceneBinding";
import {
  ScenePatchCodec,
  scenePolylineGeometry,
  sceneTimestamp,
  type SceneGeometryInput,
} from "@/workers/data/render-codecs/sceneCodec";
import {
  CycloneSceneAttribute,
  CycloneSceneDefault,
  CycloneSceneRole,
  CycloneSceneSchema,
  CycloneSceneStringAttribute,
  CycloneSceneText,
  CycloneWindQuadrant,
  CycloneWindThreshold,
  cycloneForecastPathSceneId,
  cycloneForecastSceneId,
  cycloneModelPathSceneId,
  cyclonePastPathSceneId,
  cycloneWindRadiusSceneId,
} from "@/workers/render/scene/cycloneSchema";
import { Domain } from "@shared/domain/identity";
import type { GeoLineString, GeoPoint } from "@shared/geo";

export type CycloneSceneRecord = Readonly<{
  id: string;
  position: GeoPoint;
  timestamp: string | undefined;
  role: CycloneSceneRole;
  saffirSimpson: number;
  maxWindKt: number;
  forecastHour: number;
  errorRadiusNm: number;
  windThresholdKt: CycloneWindThreshold;
  windRadii: readonly number[];
  modelCode: string;
  geometry: SceneGeometryInput | null;
}>;

function linePoint(latitude: number, longitude: number): GeoPoint {
  return [longitude, latitude];
}

function baseRecord(
  cyclone: CyclonePoint,
  id: string,
  role: CycloneSceneRole,
): CycloneSceneRecord {
  return {
    id,
    position: linePoint(cyclone.lat, cyclone.lon),
    timestamp: cyclone.timestamp,
    role,
    saffirSimpson: cyclone.data.saffirSimpson,
    maxWindKt: cyclone.data.maxWindKt,
    forecastHour: CycloneSceneDefault.Numeric,
    errorRadiusNm: CycloneSceneDefault.Numeric,
    windThresholdKt: CycloneWindThreshold.None,
    windRadii: [],
    modelCode: CycloneSceneText.Empty,
    geometry: null,
  };
}

function forecastRecord(
  cyclone: CyclonePoint,
  forecast: ForecastPoint,
): CycloneSceneRecord {
  return {
    ...baseRecord(
      cyclone,
      cycloneForecastSceneId(
        cyclone.data.stormId,
        forecast.fcstHour,
      ),
      CycloneSceneRole.Forecast,
    ),
    position: linePoint(forecast.lat, forecast.lon),
    timestamp: forecast.validTime,
    maxWindKt: forecast.maxWindKt,
    forecastHour: forecast.fcstHour,
    errorRadiusNm: forecast.errorRadiusNm,
  };
}

function forecastPathRecord(
  cyclone: CyclonePoint,
): CycloneSceneRecord | null {
  if (cyclone.data.forecast.length === 0) return null;
  const line: GeoPoint[] = [
    linePoint(cyclone.lat, cyclone.lon),
    ...cyclone.data.forecast.map((forecast) =>
      linePoint(forecast.lat, forecast.lon),
    ),
  ];
  return {
    ...baseRecord(
      cyclone,
      cycloneForecastPathSceneId(cyclone.id),
      CycloneSceneRole.ForecastPath,
    ),
    geometry: scenePolylineGeometry([line]),
  };
}

function pastPathRecord(
  cyclone: CyclonePoint,
  pastTrack: readonly PastTrackPoint[],
): CycloneSceneRecord | null {
  if (pastTrack.length < 2) return null;
  const line: GeoPoint[] = [
    ...pastTrack.map((point) => linePoint(point.lat, point.lon)),
    linePoint(cyclone.lat, cyclone.lon),
  ];
  return {
    ...baseRecord(
      cyclone,
      cyclonePastPathSceneId(cyclone.id),
      CycloneSceneRole.PastPath,
    ),
    geometry: scenePolylineGeometry([line]),
  };
}

function windRadiusRecord(
  cyclone: CyclonePoint,
  wind: WindRadii,
  threshold: CycloneWindThreshold,
  quadrants: readonly number[] | null,
): CycloneSceneRecord | null {
  if (!quadrants) return null;
  return {
    ...baseRecord(
      cyclone,
      cycloneWindRadiusSceneId(cyclone.id, threshold),
      CycloneSceneRole.WindRadius,
    ),
    position: linePoint(wind.lat, wind.lon),
    timestamp: wind.validTime,
    maxWindKt: wind.vmaxKt,
    windThresholdKt: threshold,
    windRadii: quadrants,
  };
}

function modelPathRecord(
  cyclone: CyclonePoint,
  model: ModelTrack,
): CycloneSceneRecord | null {
  if (model.points.length < 2) return null;
  const line: GeoLineString = model.points.map((point) =>
    linePoint(point.lat, point.lon),
  );
  return {
    ...baseRecord(
      cyclone,
      cycloneModelPathSceneId(cyclone.id, model.model),
      CycloneSceneRole.ModelPath,
    ),
    modelCode: model.model,
    geometry: scenePolylineGeometry([line]),
  };
}

function radiusAt(
  record: CycloneSceneRecord,
  quadrant: CycloneWindQuadrant,
): number {
  return record.windRadii[quadrant] ?? CycloneSceneDefault.Numeric;
}

export class CycloneSceneRecordProjector {
  project(cyclone: CyclonePoint): readonly CycloneSceneRecord[] {
    const records: CycloneSceneRecord[] = [
      baseRecord(cyclone, cyclone.id, CycloneSceneRole.Current),
      ...cyclone.data.forecast.map((forecast) =>
        forecastRecord(cyclone, forecast),
      ),
    ];
    const forecastPath = forecastPathRecord(cyclone);
    if (forecastPath) records.push(forecastPath);
    const pastPath = pastPathRecord(cyclone, cyclone.data.pastTrack ?? []);
    if (pastPath) records.push(pastPath);
    this.appendWindRadiusRecords(records, cyclone);
    this.appendModelPathRecords(records, cyclone);
    return records;
  }

  private appendWindRadiusRecords(
    records: CycloneSceneRecord[],
    cyclone: CyclonePoint,
  ): void {
    const wind = cyclone.data.windRadii;
    if (!wind) return;
    const candidates = [
      windRadiusRecord(
        cyclone,
        wind,
        CycloneWindThreshold.Gale,
        wind.kt34,
      ),
      windRadiusRecord(
        cyclone,
        wind,
        CycloneWindThreshold.Storm,
        wind.kt50,
      ),
      windRadiusRecord(
        cyclone,
        wind,
        CycloneWindThreshold.Hurricane,
        wind.kt64,
      ),
    ];
    for (const candidate of candidates) {
      if (candidate) records.push(candidate);
    }
  }

  private appendModelPathRecords(
    records: CycloneSceneRecord[],
    cyclone: CyclonePoint,
  ): void {
    const modelCodes = new Set<string>();
    for (const model of cyclone.data.models ?? []) {
      if (modelCodes.has(model.model)) continue;
      modelCodes.add(model.model);
      const record = modelPathRecord(cyclone, model);
      if (record) records.push(record);
    }
  }
}

export class CycloneSceneBinding extends SceneBinding<
  CyclonePoint,
  CycloneSceneRecord
> {
  constructor(publishScene: SceneCommandPublisher) {
    const projector = new CycloneSceneRecordProjector();
    super(
      new ScenePatchCodec<CyclonePoint, CycloneSceneRecord>({
        source: Domain.Cyclones,
        attributeStride: CycloneSceneSchema.AttributeStride,
        stringAttributeStride: CycloneSceneSchema.StringAttributeStride,
        records: (cyclone) => projector.project(cyclone),
        position: (record) => record.position,
        timestamp: sceneTimestamp,
        geometry: (record) => record.geometry,
        writeAttributes: (record, target, offset) => {
          target[offset + CycloneSceneAttribute.Role] = record.role;
          target[offset + CycloneSceneAttribute.SaffirSimpson] =
            record.saffirSimpson;
          target[offset + CycloneSceneAttribute.MaxWindKt] =
            record.maxWindKt;
          target[offset + CycloneSceneAttribute.ForecastHour] =
            record.forecastHour;
          target[offset + CycloneSceneAttribute.ErrorRadiusNm] =
            record.errorRadiusNm;
          target[offset + CycloneSceneAttribute.WindThresholdKt] =
            record.windThresholdKt;
          target[offset + CycloneSceneAttribute.WindRadiusNe] = radiusAt(
            record,
            CycloneWindQuadrant.Northeast,
          );
          target[offset + CycloneSceneAttribute.WindRadiusSe] = radiusAt(
            record,
            CycloneWindQuadrant.Southeast,
          );
          target[offset + CycloneSceneAttribute.WindRadiusSw] = radiusAt(
            record,
            CycloneWindQuadrant.Southwest,
          );
          target[offset + CycloneSceneAttribute.WindRadiusNw] = radiusAt(
            record,
            CycloneWindQuadrant.Northwest,
          );
        },
        writeStringAttributes: (record, target, offset, intern) => {
          target[offset + CycloneSceneStringAttribute.ModelCode] =
            intern(record.modelCode);
        },
      }),
      publishScene,
    );
  }
}

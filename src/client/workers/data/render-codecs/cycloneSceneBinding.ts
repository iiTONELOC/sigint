import type { CyclonePoint } from "@/features/environmental/cyclones/data/codec";
import {
  atcfTimeMs,
  Category,
  cycloneTimeMs,
  CYCLONE_CATEGORY_METADATA,
  CYCLONE_STRONG_WIND_RADIUS_KT,
  mappedArrivalLines,
  mappedWindChances,
  type ForecastPoint,
  type ModelTrack,
  type PastTrackPoint,
  type WindRadii,
} from "@shared/domain/cyclones";
import {
  SceneBinding,
  type SceneCommandPublisher,
} from "@/workers/data/render-codecs/sceneBinding";
import {
  ScenePatchCodec,
  scenePolygonGeometry,
  scenePolylineGeometry,
  sceneTimestamp,
  type SceneGeometryInput,
} from "@/workers/data/render-codecs/sceneCodec";
import {
  CycloneSceneAttribute,
  CycloneSceneDefault,
  CycloneSceneRole,
  CycloneSceneStringAttribute,
  CycloneSceneText,
  CycloneWindQuadrant,
  cycloneConeSceneId,
  cycloneHazardSceneId,
  SceneGeometryKind,
  cycloneForecastSceneId,
  cycloneModelPathSceneId,
  cyclonePastPointSceneId,
  cycloneWindRadiusSceneId,
} from "@shared/scene";
import { Domain } from "@shared/domain/identity";
import type { GeoLineString, GeoPoint } from "@shared/geo";
import { MS_PER_HOUR } from "@shared/time";

export type CycloneSceneRecord = Readonly<{
  id: string;
  position: GeoPoint;
  timestamp: string | undefined;
  role: CycloneSceneRole;
  saffirSimpson: number;
  maxWindKt: number;
  forecastHour: number;
  windThresholdKt: number;
  windRadii: readonly number[];
  modelCode: string;
  label: string;
  hazardRank: number;
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
    windThresholdKt: CycloneSceneDefault.Numeric,
    windRadii: [],
    modelCode: CycloneSceneText.Empty,
    label: CycloneSceneText.Empty,
    hazardRank: CycloneSceneDefault.Numeric,
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
  };
}

function pastPointRecord(
  cyclone: CyclonePoint,
  point: PastTrackPoint,
  index: number,
): CycloneSceneRecord {
  return {
    ...baseRecord(cyclone, cyclonePastPointSceneId(cyclone.id, index), CycloneSceneRole.PastPoint),
    position: linePoint(point.lat, point.lon),
    timestamp: point.validTime,
    maxWindKt: point.vmaxKt,
    forecastHour: (atcfTimeMs(point.validTime) - Date.parse(cyclone.data.lastUpdate)) / MS_PER_HOUR,
  };
}

function coneRecord(cyclone: CyclonePoint): CycloneSceneRecord | null {
  const cone = cyclone.data.officialCone;
  if (!cone) return null;
  return {
    ...baseRecord(cyclone, cycloneConeSceneId(cyclone.id), CycloneSceneRole.Cone),
    geometry: scenePolygonGeometry(cone),
  };
}

type HazardShape = Readonly<{
  role: CycloneSceneRole;
  index: number;
  geometry: SceneGeometryInput;
  label?: string;
}>;

function hazardRecord(cyclone: CyclonePoint, shape: HazardShape): CycloneSceneRecord | null {
  const first = shape.geometry.groups[0]?.[0]?.[0];
  if (!first) return null;
  return {
    ...baseRecord(cyclone, cycloneHazardSceneId(cyclone.id, shape.role, shape.index), shape.role),
    position: first,
    label: shape.label ?? CycloneSceneText.Empty,
    hazardRank: shape.index,
    geometry: shape.geometry,
  };
}

function polygonShape(rings: readonly (readonly GeoPoint[])[]): SceneGeometryInput | null {
  return rings.length > 0 ? { kind: SceneGeometryKind.Polygon, groups: rings.map((ring) => [[...ring]]) } : null;
}

function hazardShapes(cyclone: CyclonePoint): HazardShape[] {
  const hazards = cyclone.data.hazards;
  const shapes: HazardShape[] = [];
  (mappedWindChances(hazards)?.bands ?? []).forEach((band, index) => {
    const geometry = polygonShape(band.rings);
    if (geometry) shapes.push({ role: CycloneSceneRole.WindChance, index, geometry });
  });
  (hazards?.peakSurge ?? []).forEach((area, index) => {
    const geometry = polygonShape(area.rings);
    if (geometry) shapes.push({ role: CycloneSceneRole.Surge, index, geometry });
  });
  mappedArrivalLines(hazards).forEach((arrival, index) => {
    const geometry = scenePolylineGeometry([[...arrival.line]]);
    shapes.push({ role: CycloneSceneRole.Arrival, index, geometry, label: arrival.label });
  });
  return shapes;
}

function windRadiusRecord(
  cyclone: CyclonePoint,
  wind: WindRadii,
  threshold: number,
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
    records.push(...(cyclone.data.pastTrack ?? []).map((point, index) => pastPointRecord(cyclone, point, index)));
    const cone = coneRecord(cyclone);
    if (cone) records.push(cone);
    this.appendWindRadiusRecords(records, cyclone);
    this.appendModelPathRecords(records, cyclone);
    for (const shape of hazardShapes(cyclone)) {
      const record = hazardRecord(cyclone, shape);
      if (record) records.push(record);
    }
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
        CYCLONE_CATEGORY_METADATA[Category.TropicalStorm].minimumWindKt,
        wind.kt34,
      ),
      windRadiusRecord(
        cyclone,
        wind,
        CYCLONE_STRONG_WIND_RADIUS_KT,
        wind.kt50,
      ),
      windRadiusRecord(
        cyclone,
        wind,
        CYCLONE_CATEGORY_METADATA[Category.Hurricane1].minimumWindKt,
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
        records: (cyclone) => projector.project(cyclone),
        position: (record) => record.position,
        timestamp: (record) => sceneTimestamp(record, cycloneTimeMs),
        geometry: (record) => record.geometry,
        writeAttributes: (record, target, offset) => {
          target[offset + CycloneSceneAttribute.Role] = record.role;
          target[offset + CycloneSceneAttribute.SaffirSimpson] =
            record.saffirSimpson;
          target[offset + CycloneSceneAttribute.MaxWindKt] =
            record.maxWindKt;
          target[offset + CycloneSceneAttribute.ForecastHour] =
            record.forecastHour;
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
          target[offset + CycloneSceneAttribute.HazardRank] = record.hazardRank;
        },
        writeStringAttributes: (record, target, offset, intern) => {
          target[offset + CycloneSceneStringAttribute.ModelCode] =
            intern(record.modelCode);
          target[offset + CycloneSceneStringAttribute.Label] =
            intern(record.label);
        },
      }),
      publishScene,
    );
  }
}

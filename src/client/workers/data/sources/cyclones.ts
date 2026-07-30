import { Domain } from "@shared/domain/identity";
import { SourceCompleteness } from "@shared/source";
import {
  geoPolygonGeometryEqual,
  geoPointsEqual,
} from "@shared/geo";
import {
  CYCLONE_UI_QUERIES,
} from "@/features/environmental/cyclones/data/uiQueries";
import {
  cycloneForecastProjection,
  type CycloneForecastPoint,
} from "@/features/environmental/cyclones/data/forecastProjection";
import {
  isCyclonePoint,
  parseCycloneCache,
  type CyclonePoint,
} from "@/features/environmental/cyclones/data/codec";
import { fetchCurrentStorms } from "@/features/environmental/cyclones/data/parseNhc";
import type {
  CycloneData,
  ForecastPoint,
  ModelTrack,
  ModelTrackPoint,
  PastTrackPoint,
  WindRadii,
} from "@/features/environmental/cyclones/types";
import {
  EntityLifetime,
  GeoCarrier,
  GeoDataSource,
  GeoMotion,
  type SourcePolicy,
} from "@/workers/data/source-model/dataSource";
import type {
  PointSourceFetchSnapshot,
  PointSourceSchedule,
} from "@/workers/data/sourceRuntime";
import { getPointSourceDefinition } from "@/workers/data/sources/registry";

export const CYCLONE_SOURCE_POLICY: SourcePolicy = {
  ...getPointSourceDefinition(Domain.Cyclones),
};

export type CycloneSourceOptions = Readonly<{
  fetchSnapshot?: () => Promise<PointSourceFetchSnapshot<CyclonePoint>>;
  now?: () => number;
  schedule?: PointSourceSchedule;
}>;

function optionalNumbersEqual(
  left: readonly number[] | null,
  right: readonly number[] | null,
): boolean {
  return (
    left === right ||
    (left !== null &&
      right !== null &&
      left.length === right.length &&
      left.every((number, index) => number === right[index]))
  );
}

function forecastPointEqual(
  left: ForecastPoint,
  right: ForecastPoint,
): boolean {
  return (
    left.fcstHour === right.fcstHour &&
    left.validTime === right.validTime &&
    left.lat === right.lat &&
    left.lon === right.lon &&
    left.maxWindKt === right.maxWindKt &&
    left.minPressureMb === right.minPressureMb &&
    left.category === right.category &&
    left.errorRadiusNm === right.errorRadiusNm
  );
}

function pastTrackPointEqual(
  left: PastTrackPoint,
  right: PastTrackPoint,
): boolean {
  return (
    left.lat === right.lat &&
    left.lon === right.lon &&
    left.validTime === right.validTime &&
    left.vmaxKt === right.vmaxKt &&
    left.minPressureMb === right.minPressureMb
  );
}

function modelTrackPointEqual(
  left: ModelTrackPoint,
  right: ModelTrackPoint,
): boolean {
  return (
    left.tau === right.tau &&
    left.lat === right.lat &&
    left.lon === right.lon
  );
}

function modelTrackEqual(left: ModelTrack, right: ModelTrack): boolean {
  return (
    left.model === right.model &&
    left.points.length === right.points.length &&
    left.points.every((point, index) => {
      const other = right.points[index];
      return other !== undefined && modelTrackPointEqual(point, other);
    })
  );
}

function windRadiiEqual(
  left: WindRadii | undefined,
  right: WindRadii | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.lat === right.lat &&
    left.lon === right.lon &&
    left.vmaxKt === right.vmaxKt &&
    left.validTime === right.validTime &&
    optionalNumbersEqual(left.kt34, right.kt34) &&
    optionalNumbersEqual(left.kt50, right.kt50) &&
    optionalNumbersEqual(left.kt64, right.kt64)
  );
}

function arraysEqual<T>(
  left: readonly T[] | undefined,
  right: readonly T[] | undefined,
  equal: (left: T, right: T) => boolean,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.length === right.length &&
    left.every((item, index) => {
      const other = right[index];
      return other !== undefined && equal(item, other);
    })
  );
}

function cycloneDataEqual(left: CycloneData, right: CycloneData): boolean {
  return (
    left.stormId === right.stormId &&
    left.name === right.name &&
    left.basin === right.basin &&
    left.classification === right.classification &&
    left.saffirSimpson === right.saffirSimpson &&
    left.maxWindKt === right.maxWindKt &&
    left.minPressureMb === right.minPressureMb &&
    left.movementDir === right.movementDir &&
    left.movementSpeedKt === right.movementSpeedKt &&
    left.advisoryNumber === right.advisoryNumber &&
    left.lastUpdate === right.lastUpdate &&
    arraysEqual(left.forecast, right.forecast, forecastPointEqual) &&
    geoPolygonGeometryEqual(left.officialCone, right.officialCone) &&
    windRadiiEqual(left.windRadii, right.windRadii) &&
    arraysEqual(left.pastTrack, right.pastTrack, pastTrackPointEqual) &&
    arraysEqual(left.models, right.models, modelTrackEqual)
  );
}

export function cyclonePointsEqual(
  left: CyclonePoint,
  right: CyclonePoint,
): boolean {
  return (
    left.id === right.id &&
    left.type === right.type &&
    geoPointsEqual([left.lon, left.lat], [right.lon, right.lat]) &&
    left.timestamp === right.timestamp &&
    cycloneDataEqual(left.data, right.data)
  );
}

function retainedArray<T>(
  current: T[] | undefined,
  previous: T[] | undefined,
): T[] | undefined {
  return current && current.length > 0 ? current : previous;
}

export function reconcileCyclonePoint(
  previous: CyclonePoint | null,
  current: CyclonePoint,
): CyclonePoint {
  if (!previous) return current;
  return {
    ...current,
    data: {
      ...current.data,
      forecast:
        retainedArray(current.data.forecast, previous.data.forecast) ?? [],
      officialCone:
        current.data.officialCone ?? previous.data.officialCone,
      windRadii: current.data.windRadii ?? previous.data.windRadii,
      pastTrack:
        retainedArray(current.data.pastTrack, previous.data.pastTrack),
      models: retainedArray(current.data.models, previous.data.models),
    },
  };
}

export class CycloneSource extends GeoDataSource<CyclonePoint> {
  readonly policy = CYCLONE_SOURCE_POLICY;
  readonly carrier = GeoCarrier.Path;
  readonly motion = GeoMotion.Moving;
  readonly lifetime = EntityLifetime.Persistent;
  readonly pointType = Domain.Cyclones;
  readonly queries = CYCLONE_UI_QUERIES;

  private readonly fetchSnapshotOverride:
    | (() => Promise<PointSourceFetchSnapshot<CyclonePoint>>)
    | null;
  private readonly now: () => number;

  constructor(options: CycloneSourceOptions = {}) {
    super([], options.schedule ? { schedule: options.schedule } : {});
    this.fetchSnapshotOverride = options.fetchSnapshot ?? null;
    this.now = options.now ?? Date.now;
  }

  resolveEntity(
    id: string,
  ): CyclonePoint | CycloneForecastPoint | null {
    const cyclone = this.get(id);
    if (cyclone) return cyclone;
    for (const candidate of this.values()) {
      const forecast = cycloneForecastProjection(candidate, id);
      if (forecast) return forecast;
    }
    return null;
  }

  protected parseCache(value: unknown): readonly CyclonePoint[] | null {
    return parseCycloneCache(value);
  }

  protected async fetchSnapshot(): Promise<
    PointSourceFetchSnapshot<CyclonePoint>
  > {
    const snapshot =
      await (this.fetchSnapshotOverride?.() ?? this.fetchCurrentSnapshot());
    return {
      ...snapshot,
      entities: snapshot.entities.map((current) =>
        reconcileCyclonePoint(this.requireRuntime().get(current.id), current),
      ),
    };
  }

  protected hasChanged(
    previous: CyclonePoint,
    current: CyclonePoint,
  ): boolean {
    return !cyclonePointsEqual(previous, current);
  }

  private async fetchCurrentSnapshot(): Promise<
    PointSourceFetchSnapshot<CyclonePoint>
  > {
    return {
      completeness: SourceCompleteness.Complete,
      entities: (await fetchCurrentStorms()).filter(isCyclonePoint),
      observedAt: this.now(),
    };
  }
}

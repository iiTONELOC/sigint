import {
  EntityLifetime,
  GeoCarrier,
  StationaryGeoDataSource,
} from "@/workers/data/source-model/dataSource";
import {
  SceneBinding,
  type SceneCommandPublisher,
} from "@/workers/data/render-codecs/sceneBinding";
import {
  ScenePatchCodec,
  scenePolygonGeometry,
  sceneTimestamp,
  singleSceneRecord,
} from "@/workers/data/render-codecs/sceneCodec";
import { recordPosition } from "@/workers/data/source-model/position";
import type {
  PointSourceFetchSnapshot,
  PointSourceSchedule,
} from "@/workers/data/sourceRuntime";
import {
  getPointSourceDefinition,
} from "@shared/domain/pointSource";
import { Domain } from "@shared/domain/identity";
import {
  geoPointsEqual,
  geoPolygonGeometryEqual,
} from "@shared/geo";
import {
  areaKindRank,
  type CycloneWarningPoint,
} from "@shared/domain/cyclones";
import { parseCycloneWarningCache } from "./data/warningCodec";
import { fetchCycloneWarningSnapshot } from "./data/warnings";
import { CycloneWarningSceneAttribute } from "@shared/scene";

export type CycloneWarningSourceOptions = Readonly<{
  fetchSnapshot?: () => Promise<
    PointSourceFetchSnapshot<CycloneWarningPoint>
  >;
  schedule?: PointSourceSchedule;
}>;

export class CycloneWarningSource extends StationaryGeoDataSource<CycloneWarningPoint> {
  readonly policy = getPointSourceDefinition(Domain.CycloneWarnings);
  readonly carrier = GeoCarrier.Polygon;
  readonly lifetime = EntityLifetime.Ephemeral;

  private readonly fetchSnapshotOverride:
    | (() => Promise<PointSourceFetchSnapshot<CycloneWarningPoint>>)
    | null;

  constructor(options: CycloneWarningSourceOptions = {}) {
    super([], options.schedule ? { schedule: options.schedule } : {});
    this.fetchSnapshotOverride = options.fetchSnapshot ?? null;
  }

  protected parseCache(
    value: unknown,
  ): readonly CycloneWarningPoint[] | null {
    return parseCycloneWarningCache(value);
  }

  protected fetchSnapshot(): Promise<
    PointSourceFetchSnapshot<CycloneWarningPoint>
  > {
    return (
      this.fetchSnapshotOverride?.() ??
      fetchCycloneWarningSnapshot()
    );
  }

  protected hasChanged(
    previous: CycloneWarningPoint,
    next: CycloneWarningPoint,
  ): boolean {
    return (
      !geoPointsEqual(previous.position, next.position) ||
      previous.timestamp !== next.timestamp ||
      previous.data.kind !== next.data.kind ||
      previous.data.expires !== next.data.expires ||
      previous.data.headline !== next.data.headline ||
      !geoPolygonGeometryEqual(
        previous.data.geometry,
        next.data.geometry,
      )
    );
  }
}

export class CycloneWarningSceneBinding extends SceneBinding<CycloneWarningPoint> {
  constructor(publishScene: SceneCommandPublisher) {
    super(
      new ScenePatchCodec<CycloneWarningPoint>({
        source: Domain.CycloneWarnings,
        records: singleSceneRecord,
        position: recordPosition,
        timestamp: sceneTimestamp,
        geometry: (point) => scenePolygonGeometry(point.data.geometry),
        writeAttributes: (point, target, offset) => {
          target[offset + CycloneWarningSceneAttribute.Kind] =
            areaKindRank(point.data.kind);
        },
      }),
      publishScene,
    );
  }
}

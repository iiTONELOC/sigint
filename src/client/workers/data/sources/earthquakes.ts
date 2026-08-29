import { parsePoints } from "@/features/base/pointCodec";
import {
  EARTHQUAKE_FEED,
  parseEarthquakePoint,
  type EarthquakePoint,
} from "@/features/environmental/earthquake/data/source";
import {
  pointSceneBinding,
  type SceneBinding,
  type SceneCommandPublisher,
} from "@/workers/data/render-codecs/sceneBinding";
import {
  GeoCarrier,
  StationaryPointSource,
  feedFetch,
  recordChanged,
  type PointSourceOptions,
} from "@/workers/data/source-model/dataSource";
import { earthquakeDataEquals } from "@shared/domain/earthquakes";
import { Domain } from "@shared/domain/identity";
import { getPointSourceDefinition } from "@shared/domain/pointSource";
import { EarthquakeSceneAttribute } from "@shared/scene";

enum EarthquakeSceneDefault {
  Numeric = 0,
}

export class EarthquakeSource extends StationaryPointSource<
  Domain.Earthquake,
  EarthquakePoint
> {
  constructor(options: PointSourceOptions<EarthquakePoint> = {}) {
    super({
      policy: getPointSourceDefinition(Domain.Earthquake),
      carrier: GeoCarrier.Position,
      parseCache: (value) => parsePoints(value, parseEarthquakePoint),
      fetchSnapshot: feedFetch(options, EARTHQUAKE_FEED),
      hasChanged: recordChanged(earthquakeDataEquals),
      ...(options.schedule ? { schedule: options.schedule } : {}),
    });
  }
}

export function earthquakeSceneBinding(
  publishScene: SceneCommandPublisher,
): SceneBinding<EarthquakePoint> {
  return pointSceneBinding(publishScene, {
    source: Domain.Earthquake,
    writeAttributes: (point, target, offset) => {
      target[offset + EarthquakeSceneAttribute.Magnitude] =
        point.data.magnitude ?? EarthquakeSceneDefault.Numeric;
    },
  });
}

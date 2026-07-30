import type { AircraftData } from "@/features/tracking/aircraft/types";
import { Domain } from "@shared/domain/identity";
import { SquawkStatus } from "@shared/domain/aircraft";
import { SourceCompleteness } from "@shared/source";
import {
  AIRCRAFT_BOOLEAN_FIELDS as BOOLEAN_FIELDS,
  AIRCRAFT_NUMBER_FIELDS as NUMBER_FIELDS,
  AIRCRAFT_STRING_FIELDS as STRING_FIELDS,
  isAircraftPoint,
  parseAircraftCache,
  type AircraftPoint,
} from "@/features/tracking/aircraft/data/codec";
import { fetchAircraftSnapshot } from "@/features/tracking/aircraft/data/parseAdsbV2";
import { getPointSourceDefinition } from "@/workers/data/sources/registry";
import { POINT_UI_QUERY_POLICY } from "@/features/base/uiQueryPolicy";
import type { DataWorkerSourceSnapshot } from "@/workers/data/protocol";
import { ScenePatchCodec } from "@/workers/data/render-codecs/sceneCodec";
import { recordPosition } from "@/workers/data/source-model/position";
import {
  createPointSourceRuntime,
  type PointSourceCacheSnapshot,
  type PointSourceFetchSnapshot,
  type PointSourceRuntime,
} from "@/workers/data/sourceRuntime";
import type { SceneSourcePatch } from "@/workers/render/sceneProtocol";
import {
  AircraftSceneAttribute,
  AircraftSceneFlag,
  AircraftSceneSchema,
  AircraftSceneSquawk,
  AircraftSceneStringAttribute,
} from "@/workers/render/scene/aircraftSchema";

export { isAircraftPoint, parseAircraftCache, type AircraftPoint };

export const AIRCRAFT_SOURCE = getPointSourceDefinition(Domain.Aircraft);

export type AircraftSourceRuntime = PointSourceRuntime<AircraftPoint> &
  Readonly<{ publishRebase: () => void }>;

export type AircraftSourceRuntimeOptions = Readonly<{
  readCache: () => Promise<unknown>;
  persistCache: (
    snapshot: PointSourceCacheSnapshot<AircraftPoint>,
  ) => Promise<void>;
  fetchSnapshot?: () => Promise<PointSourceFetchSnapshot<AircraftPoint>>;
  publishStatus: (status: DataWorkerSourceSnapshot) => void;
  publishScene: (patch: SceneSourcePatch) => void;
  /** Every entity this poll added or moved, for the trail recorder. */
  observe?: (points: readonly AircraftPoint[]) => void;
}>;

function arraysEqual(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  if (left === right) return true;
  if (!left || !right || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function aircraftChanged(
  previous: AircraftPoint,
  next: AircraftPoint,
): boolean {
  if (
    previous.lat !== next.lat ||
    previous.lon !== next.lon ||
    previous.timestamp !== next.timestamp
  ) {
    return true;
  }
  if (
    STRING_FIELDS.some(
      (key) => previous.data[key] !== next.data[key],
    ) ||
    NUMBER_FIELDS.some(
      (key) => previous.data[key] !== next.data[key],
    ) ||
    BOOLEAN_FIELDS.some(
      (key) => previous.data[key] !== next.data[key],
    )
  ) {
    return true;
  }
  return !arraysEqual(previous.data.navModes, next.data.navModes);
}

function squawkCode(
  value: SquawkStatus | undefined,
): AircraftSceneSquawk {
  if (value === SquawkStatus.Emergency) {
    return AircraftSceneSquawk.Emergency;
  }
  if (value === SquawkStatus.RadioFailure) {
    return AircraftSceneSquawk.RadioFailure;
  }
  if (value === SquawkStatus.Hijack) {
    return AircraftSceneSquawk.Hijack;
  }
  return AircraftSceneSquawk.Normal;
}

function aircraftFlags(data: AircraftData): number {
  return (
    (data.military ? AircraftSceneFlag.Military : 0) +
    (data.recon ? AircraftSceneFlag.Recon : 0) +
    (data.onGround ? AircraftSceneFlag.OnGround : 0)
  );
}

function aircraftTimestamp(point: AircraftPoint): number {
  if (!point.timestamp) return 0;
  const timestamp = Date.parse(point.timestamp);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

async function fetchLiveAircraft(): Promise<
  PointSourceFetchSnapshot<AircraftPoint>
> {
  const result = await fetchAircraftSnapshot();
  return {
    completeness:
      result.source.completeness === SourceCompleteness.Complete
        ? SourceCompleteness.Complete
        : SourceCompleteness.Partial,
    entities: result.data.filter(isAircraftPoint),
    observedAt:
      result.source.observedAt ??
      result.source.receivedAt ??
      Date.now(),
  };
}

export function createAircraftSourceRuntime(
  options: AircraftSourceRuntimeOptions,
): AircraftSourceRuntime {
  const codec = new ScenePatchCodec<AircraftPoint>({
    source: AIRCRAFT_SOURCE.id,
    attributeStride: AircraftSceneSchema.AttributeStride,
    stringAttributeStride: AircraftSceneSchema.StringAttributeStride,
    position: recordPosition,
    timestamp: aircraftTimestamp,
    writeAttributes: (point, target, offset) => {
      target[offset + AircraftSceneAttribute.Heading] =
        point.data.heading ?? 0;
      target[offset + AircraftSceneAttribute.Flags] =
        aircraftFlags(point.data);
      target[offset + AircraftSceneAttribute.Squawk] =
        squawkCode(point.data.squawkStatus);
    },
    writeStringAttributes: (point, target, offset, intern) => {
      target[offset + AircraftSceneStringAttribute.Country] =
        intern(point.data.originCountry ?? "");
    },
  });

  const runtime = createPointSourceRuntime<AircraftPoint>({
    id: AIRCRAFT_SOURCE.id,
    cacheKey: AIRCRAFT_SOURCE.cacheKey,
    pollIntervalMs: AIRCRAFT_SOURCE.pollIntervalMs,
    maxQueryItems: POINT_UI_QUERY_POLICY.datasetQueryLimit,
    hasChanged: aircraftChanged,
    readCache: options.readCache,
    parseCache: parseAircraftCache,
    persistCache: options.persistCache,
    fetchSnapshot: options.fetchSnapshot ?? fetchLiveAircraft,
    publishStatus: options.publishStatus,
    publishPatch: (patch) => {
      options.observe?.(patch.upserts);
      options.publishScene(codec.encode(patch));
    },
  });

  return {
    ...runtime,
    publishRebase(): void {
      const patch = runtime.rebase();
      if (patch) options.publishScene(codec.encode(patch));
    },
  };
}

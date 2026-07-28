import type { AircraftData } from "@/features/tracking/aircraft/types";
import { Domain } from "@shared/domain/identity";
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
import { createScenePatchCodec } from "@/workers/data/render-codecs/sceneCodec";
import {
  createPointSourceRuntime,
  type PointSourceCacheSnapshot,
  type PointSourceFetchSnapshot,
  type PointSourceRuntime,
} from "@/workers/data/sourceRuntime";
import type { SceneSourcePatch } from "@/workers/render/sceneProtocol";
import { AIRCRAFT_SCENE } from "@/workers/render/scene/aircraftSchema";

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

function squawkCode(value: AircraftData["squawkStatus"]): number {
  if (value === "emergency") return AIRCRAFT_SCENE.squawks.emergency;
  if (value === "radio_failure") {
    return AIRCRAFT_SCENE.squawks.radioFailure;
  }
  if (value === "hijack") return AIRCRAFT_SCENE.squawks.hijack;
  return AIRCRAFT_SCENE.squawks.normal;
}

function aircraftFlags(data: AircraftData): number {
  return (
    (data.military ? AIRCRAFT_SCENE.flags.military : 0) +
    (data.recon ? AIRCRAFT_SCENE.flags.recon : 0) +
    (data.onGround ? AIRCRAFT_SCENE.flags.onGround : 0)
  );
}

async function fetchLiveAircraft(): Promise<
  PointSourceFetchSnapshot<AircraftPoint>
> {
  const result = await fetchAircraftSnapshot();
  return {
    completeness:
      result.source.completeness === "complete"
        ? "complete"
        : "partial",
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
  const codec = createScenePatchCodec<AircraftPoint>({
    source: AIRCRAFT_SOURCE.id,
    attributeStride: AIRCRAFT_SCENE.attributeStride,
    stringAttributeStride: AIRCRAFT_SCENE.stringAttributeStride,
    writeAttributes: (point, target, offset) => {
      target[offset + AIRCRAFT_SCENE.attributes.heading] =
        point.data.heading ?? 0;
      target[offset + AIRCRAFT_SCENE.attributes.flags] =
        aircraftFlags(point.data);
      target[offset + AIRCRAFT_SCENE.attributes.squawk] =
        squawkCode(point.data.squawkStatus);
    },
    writeStringAttributes: (point, target, offset, intern) => {
      target[offset + AIRCRAFT_SCENE.stringAttributes.country] =
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

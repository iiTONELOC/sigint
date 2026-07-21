import type { DataPoint } from "@/features/base/dataPoints";
import type { AircraftData } from "@/features/tracking/aircraft/types";
import { fetchAircraftSnapshot } from "@/features/tracking/aircraft/data/parseAdsbV2";
import { CACHE_KEYS } from "@/lib/cache/cacheKeys";
import { POLL_INTERVALS } from "@/lib/cache/pollIntervals";
import { createScenePatchCodec } from "@/workers/data/render-codecs/sceneCodec";
import {
  createPointSourceRuntime,
  type PointSourceCacheSnapshot,
  type PointSourceFetchSnapshot,
  type PointSourceRuntime,
  type PointSourceStatusSnapshot,
} from "@/workers/data/sourceRuntime";
import type { SceneSourcePatch } from "@/workers/render/sceneProtocol";
import { AIRCRAFT_SCENE } from "@/workers/render/scene/aircraftSchema";
import { isRecord } from "@shared/geo";

export type AircraftPoint = Extract<DataPoint, { type: "aircraft" }>;

export type AircraftSourceRuntime = PointSourceRuntime<AircraftPoint> &
  Readonly<{ publishRebase: () => void }>;

export type AircraftSourceRuntimeOptions = Readonly<{
  readCache: () => Promise<unknown | null>;
  persistCache: (
    snapshot: PointSourceCacheSnapshot<AircraftPoint>,
  ) => Promise<void>;
  fetchSnapshot?: () => Promise<PointSourceFetchSnapshot<AircraftPoint>>;
  publishStatus: (status: PointSourceStatusSnapshot) => void;
  publishScene: (patch: SceneSourcePatch) => void;
}>;

const STRING_FIELDS = [
  "model",
  "acType",
  "icao24",
  "airport",
  "frequency",
  "callsign",
  "operator",
  "audioStream",
  "registration",
  "operatorIcao",
  "originCountry",
  "manufacturerName",
  "categoryDescription",
  "squawk",
  "squawkStatus",
  "adsbType",
] as const;

const NUMBER_FIELDS = [
  "speed",
  "heading",
  "altitude",
  "speedMps",
  "tas",
  "mach",
  "ias",
  "windDir",
  "windSpd",
  "oat",
  "tat",
  "roll",
  "trackRate",
  "magHeading",
  "trueHeading",
  "geomRate",
  "navHeading",
  "navAltitudeMcp",
  "navAltitudeFms",
  "navQnh",
  "rssi",
  "nacP",
  "verticalRate",
] as const;

const BOOLEAN_FIELDS = ["onGround", "military", "recon"] as const;

function hasOptionalFields(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  matches: (candidate: unknown) => boolean,
): boolean {
  return keys.every((key) => {
    const candidate = value[key];
    return candidate === undefined || matches(candidate);
  });
}

function isAircraftData(value: unknown): value is AircraftData {
  if (!isRecord(value)) return false;
  if (
    !hasOptionalFields(
      value,
      STRING_FIELDS,
      (item) => typeof item === "string",
    )
  ) {
    return false;
  }
  if (
    !hasOptionalFields(
      value,
      NUMBER_FIELDS,
      (item) => typeof item === "number" && Number.isFinite(item),
    )
  ) {
    return false;
  }
  if (
    !hasOptionalFields(
      value,
      BOOLEAN_FIELDS,
      (item) => typeof item === "boolean",
    )
  ) {
    return false;
  }
  return (
    value.navModes === undefined ||
    (
      Array.isArray(value.navModes) &&
      value.navModes.every((mode) => typeof mode === "string")
    )
  );
}

export function isAircraftPoint(value: unknown): value is AircraftPoint {
  return (
    isRecord(value) &&
    value.type === "aircraft" &&
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.lat === "number" &&
    Number.isFinite(value.lat) &&
    typeof value.lon === "number" &&
    Number.isFinite(value.lon) &&
    (value.timestamp === undefined ||
      typeof value.timestamp === "string") &&
    isAircraftData(value.data)
  );
}

export function parseAircraftCache(
  value: unknown,
): readonly AircraftPoint[] | null {
  if (!Array.isArray(value)) return null;
  const points: AircraftPoint[] = [];
  for (const candidate of value) {
    if (!isAircraftPoint(candidate)) return null;
    points.push(candidate);
  }
  return points;
}

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
    source: "aircraft",
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
    id: "aircraft",
    cacheKey: CACHE_KEYS.aircraft,
    pollIntervalMs: POLL_INTERVALS.aircraft,
    maxQueryItems: 200,
    hasChanged: aircraftChanged,
    readCache: options.readCache,
    parseCache: parseAircraftCache,
    persistCache: options.persistCache,
    fetchSnapshot: options.fetchSnapshot ?? fetchLiveAircraft,
    publishStatus: options.publishStatus,
    publishPatch: (patch) => {
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

import type { DataPoint } from "@/features/base/dataPoints";
import { Domain } from "@shared/domain/identity";
import { ktToMps } from "@/measurements";
import type { TrailObservation } from "@/lib/geo/trails/trailStore";
import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";

export type TrackedPoint = Extract<
  DataPoint,
  { type: Domain.Aircraft | Domain.Ships }
>;

function observedAt(timestamp: string | undefined): number | null {
  if (!timestamp) return null;
  const value = Date.parse(timestamp);
  return Number.isFinite(value) ? value : null;
}

function toMetersPerSecond(speedKnots: number | undefined): number | undefined {
  return speedKnots === undefined ? undefined : ktToMps(speedKnots);
}

export function trailObservations(
  points: readonly TrackedPoint[],
): TrailObservation[] {
  const observations: TrailObservation[] = [];
  for (const point of points) {
    const timestamp = observedAt(point.timestamp);
    if (timestamp === null) continue;
    const speed = point.type === Domain.Ships ? point.data.sog : point.data.speed;
    const speedMps = toMetersPerSecond(speed);
    observations.push({
      id: point.id,
      lat: recordLatitude(point),
      lon: recordLongitude(point),
      observedAt: timestamp,
      heading:
        point.type === Domain.Ships
          ? point.data.cog ?? point.data.heading
          : point.data.heading,
      speedMps,
      altitude:
        point.type === Domain.Aircraft ? point.data.altitude : undefined,
      speed,
    });
  }
  return observations;
}

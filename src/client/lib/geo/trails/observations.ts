import type { DataPoint } from "@/features/base/dataPoints";
import { Domain } from "@shared/domain/identity";
import { ktToMps } from "@/lib/format/units";
import type { TrailObservation } from "@/lib/geo/trails/trailStore";

export type TrackedPoint = Extract<
  DataPoint,
  { type: Domain.Aircraft | "ships" }
>;

function observedAt(timestamp: string | undefined): number | null {
  if (!timestamp) return null;
  const value = Date.parse(timestamp);
  return Number.isFinite(value) ? value : null;
}

function course(point: TrackedPoint): number | undefined {
  return point.type === "ships"
    ? point.data.cog ?? point.data.heading
    : point.data.heading;
}

function altitude(point: TrackedPoint): number | undefined {
  return point.type === "aircraft" ? point.data.altitude : undefined;
}

/** Positions a track carries this poll, in the shape the recorder wants. */
export function trailObservations(
  points: readonly TrackedPoint[],
): TrailObservation[] {
  const observations: TrailObservation[] = [];
  for (const point of points) {
    const timestamp = observedAt(point.timestamp);
    if (timestamp === null) continue;
    const speed = point.data.speed;
    observations.push({
      id: point.id,
      lat: point.lat,
      lon: point.lon,
      observedAt: timestamp,
      heading: course(point),
      speedMps:
        point.data.speedMps ??
        (speed === undefined ? undefined : ktToMps(speed)),
      altitude: altitude(point),
      speed,
    });
  }
  return observations;
}

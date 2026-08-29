// ── Cross-source correlation rules ──────────────────────────────────
// Spatial-temporal matching across data types using the 2° grid index.
// Each rule is O(n). Query points check approximately nine neighboring cells.

import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
import type { DataPoint, DataType } from "@/features/base/dataPoints";
import {
  WeatherSeverity,
  weatherSeverityRank,
} from "@shared/domain/weather";
import { Domain } from "@shared/domain/identity";
import { haversineKm } from "@shared/geo";
import { EMPTY_TEXT } from "@shared/text";
import {
  CorrelationRadiusKm,
  CROSS_SOURCE_TIME_WINDOW,
  CorrelationQueryDeg,
  buildGrid,
  getTs,
  gridQuery,
} from "./shared";

enum CrossSourceThreshold {
  ConflictSeverity = 3,
  DamagingMagnitude = 4.5,
}

enum CrossSourceMinimum {
  ShipCluster = 3,
}

const SEVERE_WEATHER_MIN_RANK = weatherSeverityRank(WeatherSeverity.Severe);
const PLURAL_SUFFIX = "s";

type PointOfType<TType extends DataType> = Extract<DataPoint, { type: TType }>;
type PointGrid = Map<number, DataPoint[]>;

export type CrossCorrelation = {
  primary: DataPoint;
  correlated: DataPoint[];
  types: ReadonlySet<DataType>;
  description: string;
};

function pointsOfType<TType extends DataType>(
  items: readonly DataPoint[],
  type: TType,
): PointOfType<TType>[] {
  return items.filter((item): item is PointOfType<TType> => item.type === type);
}

function buildGridFor(items: readonly DataPoint[]): PointGrid | null {
  return items.length > 0 ? buildGrid([...items]) : null;
}

function queryNear(
  grid: PointGrid,
  origin: DataPoint,
  radiusDeg: CorrelationQueryDeg,
): DataPoint[] {
  return gridQuery(
    grid,
    recordLatitude(origin),
    recordLongitude(origin),
    radiusDeg,
  );
}

function isWithinKm(from: DataPoint, to: DataPoint, radiusKm: number): boolean {
  return (
    haversineKm(
      recordLatitude(from),
      recordLongitude(from),
      recordLatitude(to),
      recordLongitude(to),
    ) < radiusKm
  );
}

function plural(count: number): string {
  return count > 1 ? PLURAL_SUFFIX : EMPTY_TEXT;
}

function correlateConflictWithFires(
  events: readonly PointOfType<Domain.Events>[],
  fireGrid: PointGrid,
  now: number,
): CrossCorrelation[] {
  const results: CrossCorrelation[] = [];
  for (const event of events) {
    const severity = event.data.severity ?? 0;
    if (severity < CrossSourceThreshold.ConflictSeverity) continue;
    const eventTime = getTs(event);
    if (now - eventTime > CROSS_SOURCE_TIME_WINDOW) continue;

    const nearby = queryNear(
      fireGrid,
      event,
      CorrelationQueryDeg.Standard,
    ).filter(
      (fire) =>
        Math.abs(eventTime - getTs(fire)) <= CROSS_SOURCE_TIME_WINDOW &&
        isWithinKm(event, fire, CorrelationRadiusKm.CrossSource),
    );
    if (nearby.length === 0) continue;

    results.push({
      primary: event,
      correlated: nearby,
      types: new Set([Domain.Events, Domain.Fires]),
      description: `Conflict event with ${nearby.length} fire detection${plural(nearby.length)} within ${CorrelationRadiusKm.CrossSource}km`,
    });
  }
  return results;
}

function correlateQuakeWithFires(
  quakes: readonly PointOfType<Domain.Quakes>[],
  fireGrid: PointGrid,
  now: number,
): CrossCorrelation[] {
  const results: CrossCorrelation[] = [];
  for (const quake of quakes) {
    const magnitude = quake.data.magnitude ?? 0;
    if (magnitude < CrossSourceThreshold.DamagingMagnitude) continue;
    const quakeTime = getTs(quake);
    if (now - quakeTime > CROSS_SOURCE_TIME_WINDOW) continue;

    // A fire that predates the shock was not started by it.
    const nearby = queryNear(
      fireGrid,
      quake,
      CorrelationQueryDeg.Standard,
    ).filter((fire) => {
      const fireTime = getTs(fire);
      return (
        fireTime >= quakeTime &&
        fireTime - quakeTime <= CROSS_SOURCE_TIME_WINDOW &&
        isWithinKm(quake, fire, CorrelationRadiusKm.CrossSource)
      );
    });
    if (nearby.length === 0) continue;

    results.push({
      primary: quake,
      correlated: nearby,
      types: new Set([Domain.Quakes, Domain.Fires]),
      description: `M${magnitude.toFixed(1)} earthquake with ${nearby.length} subsequent fire detection${plural(nearby.length)} nearby`,
    });
  }
  return results;
}

function correlateWeatherWithShips(
  alerts: readonly PointOfType<Domain.Weather>[],
  shipGrid: PointGrid,
): CrossCorrelation[] {
  const results: CrossCorrelation[] = [];
  for (const alert of alerts) {
    const severity = alert.data.severity;
    if (weatherSeverityRank(severity) < SEVERE_WEATHER_MIN_RANK) continue;

    const nearby = queryNear(
      shipGrid,
      alert,
      CorrelationQueryDeg.Standard,
    ).filter((ship) =>
      isWithinKm(alert, ship, CorrelationRadiusKm.CrossSource),
    );
    if (nearby.length < CrossSourceMinimum.ShipCluster) continue;

    results.push({
      primary: alert,
      correlated: nearby,
      types: new Set([Domain.Weather, Domain.Ships]),
      description: `${severity} weather alert with ${nearby.length} vessels in affected area`,
    });
  }
  return results;
}

function correlateMilitaryWithConflict(
  aircraft: readonly PointOfType<Domain.Aircraft>[],
  eventGrid: PointGrid,
): CrossCorrelation[] {
  const results: CrossCorrelation[] = [];
  for (const item of aircraft) {
    if (item.data.military !== true) continue;

    const nearby = queryNear(
      eventGrid,
      item,
      CorrelationQueryDeg.Military,
    ).filter((event) => {
      const severity =
        event.type === Domain.Events ? (event.data.severity ?? 0) : 0;
      return (
        severity >= CrossSourceThreshold.ConflictSeverity &&
        isWithinKm(item, event, CorrelationRadiusKm.Military)
      );
    });
    if (nearby.length === 0) continue;

    results.push({
      primary: item,
      correlated: nearby,
      types: new Set([Domain.Aircraft, Domain.Events]),
      description: `Military aircraft operating near ${nearby.length} conflict event${plural(nearby.length)}`,
    });
  }
  return results;
}

export function findCrossSourceCorrelations(
  items: DataPoint[],
): CrossCorrelation[] {
  const now = Date.now();
  const fires = pointsOfType(items, Domain.Fires);
  const ships = pointsOfType(items, Domain.Ships);
  const events = pointsOfType(items, Domain.Events);
  const fireGrid = buildGridFor(fires);
  const shipGrid = buildGridFor(ships);
  const eventGrid = buildGridFor(events);

  return [
    ...(fireGrid ? correlateConflictWithFires(events, fireGrid, now) : []),
    ...(fireGrid
      ? correlateQuakeWithFires(pointsOfType(items, Domain.Quakes), fireGrid, now)
      : []),
    ...(shipGrid
      ? correlateWeatherWithShips(pointsOfType(items, Domain.Weather), shipGrid)
      : []),
    ...(eventGrid
      ? correlateMilitaryWithConflict(
          pointsOfType(items, Domain.Aircraft),
          eventGrid,
        )
      : []),
  ];
}

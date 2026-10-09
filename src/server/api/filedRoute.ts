import { resolve } from "path";
import { CompassPoint } from "@shared/domain/compass";
import {
  AircraftRouteLimit,
  AircraftRoutePolylineLimit,
  isAircraftRouteWaypoint,
  type AircraftRouteFix,
  type AircraftRouteWaypoint,
} from "@shared/domain/aircraftDossier";
import { AngleConversion, haversineKm, isRecord } from "@shared/geo";
import { gunzipText } from "@shared/http";
import { createLogger } from "../lib/logger";

const logger = createLogger({ service: "filed-route" });

export const NAV_DATA_PATH = resolve(import.meta.dir, "../data/nav-data.json.gz");

const COORDINATE_FIX_RE = /^(\d{2})(\d{2})([NS])\/(\d{3})(\d{2})([EW])$/;
const ROUTE_TOKEN_SEPARATOR = /\s+/;

export type ProcedureTransitions = Readonly<Record<string, readonly string[]>>;

export type NavDataFile = Readonly<{
  fixes: Readonly<Record<string, readonly AircraftRouteWaypoint[]>>;
  airways: Readonly<Record<string, readonly (readonly string[])[]>>;
  procedures: Readonly<Record<string, ProcedureTransitions>>;
}>;

export type NavData = Readonly<{
  fixes: ReadonlyMap<string, readonly AircraftRouteWaypoint[]>;
  airways: ReadonlyMap<string, readonly (readonly string[])[]>;
  procedures: ReadonlyMap<string, ReadonlyMap<string, readonly string[]>>;
}>;

export type FiledAirport = Readonly<{
  code: string;
  point: AircraftRouteWaypoint | null;
}>;

export enum ProcedureTransition {
  Common = "",
  AllRunways = "ALL",
  RunwayPrefix = "RW",
}

/** Key of one procedure at one airport, shared by the builder and the resolver. */
export function procedureKey(airport: string, procedure: string): string {
  return `${airport} ${procedure}`;
}

function indexEntries<T>(
  value: unknown,
  isItem: (item: unknown) => item is T,
): Map<string, readonly T[]> | null {
  if (!isRecord(value)) return null;
  const index = new Map<string, readonly T[]>();
  for (const [key, items] of Object.entries(value)) {
    if (!Array.isArray(items) || !items.every(isItem)) return null;
    index.set(key, items);
  }
  return index;
}

function isFixSequence(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((name) => typeof name === "string");
}

function indexProcedures(
  value: unknown,
): Map<string, ReadonlyMap<string, readonly string[]>> | null {
  if (!isRecord(value)) return null;
  const procedures = new Map<string, ReadonlyMap<string, readonly string[]>>();
  for (const [key, transitions] of Object.entries(value)) {
    if (!isRecord(transitions)) return null;
    const legs = new Map<string, readonly string[]>();
    for (const [transition, fixes] of Object.entries(transitions)) {
      if (!isFixSequence(fixes)) return null;
      legs.set(transition, fixes);
    }
    procedures.set(key, legs);
  }
  return procedures;
}

/** Validate a nav data file and index it; null when its shape is wrong. */
export function parseNavData(value: unknown): NavData | null {
  if (!isRecord(value)) return null;
  const fixes = indexEntries(value.fixes, isAircraftRouteWaypoint);
  const airways = indexEntries(value.airways, isFixSequence);
  const procedures = indexProcedures(value.procedures);
  return fixes && airways && procedures ? { fixes, airways, procedures } : null;
}

async function readNavData(): Promise<NavData | null> {
  const file = Bun.file(NAV_DATA_PATH);
  if (!(await file.exists())) return null;
  try {
    return parseNavData(JSON.parse(await gunzipText(file.stream())));
  } catch (error) {
    logger.warn("nav data unreadable", { error });
    return null;
  }
}

let navData: Promise<NavData | null> | null = null;

function signedDegrees(
  degrees: string,
  minutes: string,
  hemisphere: string,
  negative: CompassPoint,
): number | null {
  const minuteValue = Number(minutes);
  if (minuteValue >= AngleConversion.ArcMinutesPerDegree) return null;
  const value = Number(degrees) + minuteValue / AngleConversion.ArcMinutesPerDegree;
  return hemisphere === negative ? -value : value;
}

function coordinateFix(token: string): AircraftRouteWaypoint | null {
  const [, latDeg, latMin, latHem, lonDeg, lonMin, lonHem] =
    COORDINATE_FIX_RE.exec(token) ?? [];
  if (!latDeg || !latMin || !latHem || !lonDeg || !lonMin || !lonHem) return null;
  const waypoint = [
    signedDegrees(latDeg, latMin, latHem, CompassPoint.South),
    signedDegrees(lonDeg, lonMin, lonHem, CompassPoint.West),
  ];
  return isAircraftRouteWaypoint(waypoint) ? waypoint : null;
}

function distanceKm(from: AircraftRouteWaypoint, to: AircraftRouteWaypoint): number {
  return haversineKm(from[0], from[1], to[0], to[1]);
}

function nearestFix(
  candidates: readonly AircraftRouteWaypoint[] | undefined,
  from: AircraftRouteWaypoint | null,
): AircraftRouteWaypoint | null {
  const [first, ...rest] = candidates ?? [];
  if (!first || !from) return first ?? null;
  return rest.reduce(
    (best, candidate) => distanceKm(from, candidate) < distanceKm(from, best) ? candidate : best,
    first,
  );
}

function airwayLeg(
  sequences: readonly (readonly string[])[],
  entry: string,
  exit: string,
): string[] {
  const airway = sequences.find((fixes) => fixes.includes(entry) && fixes.includes(exit));
  if (!airway) return [];
  const entryIndex = airway.indexOf(entry);
  const exitIndex = airway.indexOf(exit);
  return entryIndex < exitIndex
    ? airway.slice(entryIndex + 1, exitIndex)
    : airway.slice(exitIndex + 1, entryIndex).reverse();
}

type RouteContext = Readonly<{
  nav: NavData | null;
  tokens: readonly string[];
  origin: FiledAirport;
  destination: FiledAirport;
}>;

function tokenFixNames({ nav, tokens, origin, destination }: RouteContext, index: number): string[] {
  const token = tokens[index] ?? "";
  const previous = tokens[index - 1] ?? "";
  const next = tokens[index + 1] ?? "";
  const departure = nav?.procedures.get(procedureKey(origin.code, token));
  if (departure) {
    return [...(departure.get(ProcedureTransition.Common) ?? []), ...(departure.get(next) ?? [])];
  }
  const arrival = nav?.procedures.get(procedureKey(destination.code, token));
  if (arrival) {
    return [...(arrival.get(previous) ?? []), ...(arrival.get(ProcedureTransition.Common) ?? [])];
  }
  const sequences = nav?.airways.get(token);
  return sequences ? airwayLeg(sequences, previous, next) : [token];
}

function routeFixes(context: RouteContext): AircraftRouteFix[] {
  const fixes: AircraftRouteFix[] = [];
  context.tokens.forEach((_, index) => {
    for (const name of tokenFixNames(context, index)) {
      const previous = fixes.at(-1)?.point ?? context.origin.point;
      const point = coordinateFix(name) ?? nearestFix(context.nav?.fixes.get(name), previous);
      if (point && (point[0] !== previous?.[0] || point[1] !== previous?.[1])) {
        fixes.push({ name, point });
      }
    }
  });
  return fixes.slice(0, AircraftRouteLimit.MaximumWaypointCount);
}

export type FiledRoute = Readonly<{
  waypoints: AircraftRouteWaypoint[];
  fixes: AircraftRouteFix[];
}>;

/** Resolve a filed route between its airports; undefined when no filed fix resolves. */
export function resolveFiledRoute(
  nav: NavData | null,
  origin: FiledAirport,
  filedRoute: string | undefined,
  destination: FiledAirport,
): FiledRoute | undefined {
  const tokens = (filedRoute ?? "").split(ROUTE_TOKEN_SEPARATOR);
  const fixes = routeFixes({ nav, tokens, origin, destination });
  if (fixes.length === 0) return undefined;
  const waypoints = [origin.point, ...fixes.map((fix) => fix.point), destination.point]
    .filter((point): point is AircraftRouteWaypoint => point !== null)
    .slice(0, AircraftRouteLimit.MaximumWaypointCount);
  return waypoints.length >= AircraftRoutePolylineLimit.MinimumWaypointCount
    ? { waypoints, fixes }
    : undefined;
}

/** Resolve a filed route with the bundled nav data. */
export async function bundledFiledRoute(
  origin: FiledAirport,
  filedRoute: string | undefined,
  destination: FiledAirport,
): Promise<FiledRoute | undefined> {
  navData ??= readNavData();
  return resolveFiledRoute(await navData, origin, filedRoute, destination);
}

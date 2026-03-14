import type { AircraftFilter } from "@/domain/providers/aircraft/aircraftTypes";
import type { DataPoint } from "@/domain/providers/base/types";
import { matchesAircraftFilter } from "./aircraft/aircraftUtils";

type AircraftPoint = Extract<DataPoint, { type: "aircraft" }>;

function isAircraftPoint(item: DataPoint): item is AircraftPoint {
  return item.type === "aircraft";
}

function isEmergencySquawk(squawk?: string): boolean {
  return squawk === "7700" || squawk === "7600" || squawk === "7500";
}

function stableAircraftOrder(items: AircraftPoint[]): AircraftPoint[] {
  return [...items].sort((a, b) => {
    const aCallsign = (a.data?.callsign ?? "").trim();
    const bCallsign = (b.data?.callsign ?? "").trim();
    if (aCallsign && bCallsign && aCallsign !== bCallsign) {
      return aCallsign.localeCompare(bCallsign);
    }
    return a.id.localeCompare(b.id);
  });
}

function stablePointOrder(items: DataPoint[]): DataPoint[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

export function buildTickerItems(
  allData: DataPoint[],
  aircraftFilter: AircraftFilter,
  layers: Record<string, boolean>,
): DataPoint[] {
  const aircraft = allData
    .filter(isAircraftPoint)
    .filter((d) => matchesAircraftFilter(d, aircraftFilter));
  const nonAircraft = allData.filter(
    (d) => d.type !== "aircraft" && (layers[d.type] ?? false),
  );

  const emergencyAircraft = aircraft.filter((d) =>
    isEmergencySquawk(d.data?.squawk),
  );
  const normalAircraft = aircraft.filter(
    (d) => !isEmergencySquawk(d.data?.squawk),
  );

  const prioritizedAircraft = [
    ...emergencyAircraft,
    ...stableAircraftOrder(normalAircraft),
  ].slice(0, 24);

  if (prioritizedAircraft.length >= 20) {
    return prioritizedAircraft;
  }

  const remaining = Math.max(0, 24 - prioritizedAircraft.length);
  const supportItems = stablePointOrder(nonAircraft).slice(0, remaining);
  return [...prioritizedAircraft, ...supportItems];
}

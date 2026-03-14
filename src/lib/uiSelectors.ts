import type { AircraftFilter } from "@/domain/providers/aircraft/aircraftTypes";
import type { DataPoint } from "@/domain/providers/base/types";
import { matchesAircraftFilter } from "./aircraft/aircraftUtils";

export interface LayerCounts {
  ships: number;
  aircraft: number;
  events: number;
  quakes: number;
}

export function selectLayerCounts(
  allData: DataPoint[],
  aircraftFilter: AircraftFilter,
): LayerCounts {
  return {
    ships: allData.filter((d) => d.type === "ships").length,
    aircraft: allData.filter(
      (d) => d.type === "aircraft" && matchesAircraftFilter(d, aircraftFilter),
    ).length,
    events: allData.filter((d) => d.type === "events").length,
    quakes: allData.filter((d) => d.type === "quakes").length,
  };
}

export function selectActiveCount(
  allData: DataPoint[],
  layers: Record<string, boolean>,
  aircraftFilter: AircraftFilter,
): number {
  const nonAircraftVisible = allData.filter(
    (d) => d.type !== "aircraft" && layers[d.type],
  ).length;
  const aircraftVisible = allData.filter(
    (d) => d.type === "aircraft" && matchesAircraftFilter(d, aircraftFilter),
  ).length;
  return nonAircraftVisible + aircraftVisible;
}

export function selectAvailableAircraftCountries(
  allData: DataPoint[],
): string[] {
  const counts = new Map<string, number>();
  allData.forEach((d) => {
    if (d.type !== "aircraft") return;
    const country = d.data?.originCountry;
    if (!country) return;
    counts.set(country, (counts.get(country) ?? 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([country]) => country);
}

import type { ShipData } from "./types";

export function buildShipDetailRows(data: ShipData): [string, string][] {
  return [
    ["Vessel", data.name || ""],
    ["Type", data.vesselType || ""],
    ["Flag", data.flag || ""],
    ["Speed", `${data.speed} kn`],
    ["Heading", `${data.heading}\u00B0`],
  ];
}

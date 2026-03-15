import type { AircraftData } from "./types";
import { getSquawkStatus, getSquawkStatusLabel } from "./lib/utils";

export function buildAircraftDetailRows(data: AircraftData): [string, string][] {
  const {
    squawk,
    acType,
    speedMps,
    onGround,
    operator,
    verticalRate,
    operatorIcao,
    speed = 0,
    heading = 0,
    altitude = 0,
    model = "UNKNOWN",
    icao24 = "UNKNOWN",
    callsign = "UNKNOWN",
    registration = "UNKNOWN",
    originCountry = "UNK ORIGIN",
    manufacturerName = "UNKNOWN",
    categoryDescription = "UNKNOWN",
  } = data;

  const aircraftType =
    acType ||
    [manufacturerName, model].filter(Boolean).join(" ") ||
    categoryDescription ||
    "Unknown";

  const speedMph = Math.round(speed * 1.15078);
  const speedLine =
    typeof speedMps === "number"
      ? `${speed} kn (${speedMph} mph)`
      : `${speed} kn`;

  const fl = altitude > 0 ? `${altitude} ft` : "GND";

  const rows: [string, string][] = [
    ["Callsign", callsign],
    ["ICAO24", icao24],
    ["Type", aircraftType],
    ["Reg", registration],
    ["Operator", operator || operatorIcao || "UNK OP"],
    ["Manufacturer", manufacturerName],
    ["Model", model],
    ["Category", categoryDescription],
    ["Origin", originCountry],
    ["Altitude", fl],
    ["Speed", speedLine],
    ["Heading", `${heading}\u00B0`],
  ];

  if (verticalRate != null) {
    rows.push(["V/S", `${Math.round(verticalRate * 196.85)} fpm`]);
  }

  rows.push(["Status", onGround ? "ON GROUND" : "AIRBORNE"]);

  if (squawk) {
    const status = getSquawkStatusLabel(getSquawkStatus(squawk));
    rows.push(["Squawk", `${squawk} \u2014 ${status}`]);
  }

  return rows;
}

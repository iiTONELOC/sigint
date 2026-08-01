import {
  AircraftDataLabel,
  AircraftFlightStatusLabel,
  type AircraftData,
} from "./types";
import { getSquawkStatus, getSquawkStatusLabel } from "./lib/utils";
import {
  formatKtMph,
  metersPerSecondToFeetPerMinute,
} from "@/measurements";

export function buildAircraftDetailRows(
  data: AircraftData,
): [string, string][] {
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
    model = AircraftDataLabel.UnknownUppercase,
    icao24 = AircraftDataLabel.UnknownUppercase,
    callsign = AircraftDataLabel.UnknownUppercase,
    registration = AircraftDataLabel.UnknownUppercase,
    originCountry = AircraftDataLabel.UnknownOrigin,
    manufacturerName = AircraftDataLabel.UnknownUppercase,
    categoryDescription = AircraftDataLabel.UnknownUppercase,
  } = data;

  const aircraftType =
    acType ||
    [manufacturerName, model].filter(Boolean).join(" ") ||
    categoryDescription ||
    AircraftDataLabel.Unknown;

  const speedLine =
    typeof speedMps === "number" ? formatKtMph(speed) : `${speed} kn`;

  const fl = altitude > 0 ? `${altitude} ft` : "GND";

  const rows: [string, string][] = [
    ["Callsign", callsign],
    ["ICAO24", icao24],
    ["Type", aircraftType],
    ["Reg", registration],
    ["Operator", operator || operatorIcao || AircraftDataLabel.UnknownOperator],
    ["Classification", data.military ? "MILITARY" : "CIVILIAN"],
    ["Manufacturer", manufacturerName],
    ["Model", model],
    ["Category", categoryDescription],
    ["Origin", originCountry],
    ["Altitude", fl],
    ["Speed", speedLine],
    ["Heading", `${heading}\u00B0`],
  ];

  if (verticalRate != null) {
    rows.push([
      "V/S",
      `${Math.round(metersPerSecondToFeetPerMinute(verticalRate))} fpm`,
    ]);
  }

  rows.push([
    "Status",
    onGround
      ? AircraftFlightStatusLabel.OnGround
      : AircraftFlightStatusLabel.Airborne,
  ]);

  if (squawk) {
    const status = getSquawkStatusLabel(getSquawkStatus(squawk));
    rows.push(["Squawk", `${squawk} \u2014 ${status}`]);
  }

  const hasCallsign =
    callsign &&
    callsign !== AircraftDataLabel.UnknownUppercase &&
    callsign !== AircraftDataLabel.Unknown;
  const hasIcao =
    icao24 &&
    icao24 !== AircraftDataLabel.UnknownUppercase &&
    icao24 !== AircraftDataLabel.Unknown;

  if (hasCallsign) {
    rows.push(
      [
        "FlightAware",
        `https://flightaware.com/live/flight/${callsign.trim()}`,
      ],
      [
        "FlightRadar24",
        `https://www.flightradar24.com/${callsign.trim()}`,
      ],
    );
  }

  if (hasIcao) {
    rows.push([
      "ADS-B Exchange",
      `https://globe.adsbexchange.com/?icao=${icao24}`,
    ]);
  }

  return rows;
}

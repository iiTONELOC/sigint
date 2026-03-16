import type { ShipData } from "./types";

export function buildShipDetailRows(data: ShipData): [string, string][] {
  const rows: [string, string][] = [];

  if (data.name) rows.push(["Vessel", data.name]);
  if (data.mmsi) rows.push(["MMSI", String(data.mmsi)]);
  if (data.imo) rows.push(["IMO", String(data.imo)]);
  if (data.callSign) rows.push(["Call Sign", data.callSign]);
  if (data.vesselType && data.vesselType !== "Unknown")
    rows.push(["Type", data.vesselType]);
  if (data.navStatusLabel && data.navStatusLabel !== "Not defined")
    rows.push(["Status", data.navStatusLabel]);
  if (data.speed != null) {
    const mph = Math.round(data.speed * 1.15078);
    rows.push(["Speed", `${data.speed} kn (${mph} mph)`]);
  }
  if (data.heading != null && data.heading < 511)
    rows.push(["Heading", `${data.heading}\u00B0`]);
  if (data.cog != null) rows.push(["Course", `${Math.round(data.cog)}\u00B0`]);
  if (data.destination) rows.push(["Destination", data.destination]);
  if (data.draught != null && data.draught > 0)
    rows.push(["Draught", `${data.draught} m`]);
  if (data.length && data.length > 0) rows.push(["Length", `${data.length} m`]);
  if (data.width && data.width > 0) rows.push(["Width", `${data.width} m`]);

  return rows;
}

import {
  AgeStyle,
  formatTimestamp,
  relativeAge,
} from "@/time";
import { FireDayNight } from "@shared/domain/fireDayNight";
import type { FireData } from "./types";
import {
  FireCopy,
  formatFirePower,
  formatFireTemperature,
} from "./formatters";

export function buildFireDetailRows(
  data: FireData,
  timestamp?: string,
): [string, string][] {
  const rows: [string, string][] = [];

  if (data.frp != null && data.frp > 0) {
    rows.push([FireCopy.RadiativePower, formatFirePower(data.frp)]);
  }

  if (data.brightness != null && data.brightness > 0) {
    rows.push(["Brightness", formatFireTemperature(data.brightness)]);
  }

  if (data.brightT31 != null && data.brightT31 > 0) {
    rows.push(["Bright T31", formatFireTemperature(data.brightT31)]);
  }

  if (data.confidence) {
    rows.push(["Confidence", data.confidence.toUpperCase()]);
  }

  if (data.satellite) {
    rows.push(["Satellite", data.satellite]);
  }

  if (data.instrument) {
    rows.push(["Instrument", data.instrument]);
  }

  if (data.daynight) {
    rows.push([
      "Detection",
      data.daynight === FireDayNight.Day ? "DAYTIME" : "NIGHTTIME",
    ]);
  }

  if (data.scan != null && data.track != null) {
    rows.push([
      "Pixel",
      `${data.scan.toFixed(1)} × ${data.track.toFixed(1)} km`,
    ]);
  }

  if (timestamp) {
    const ts = new Date(timestamp).getTime();
    rows.push([
      "Detected",
      `${formatTimestamp(timestamp)} (${relativeAge(ts, AgeStyle.Verbose)})`,
    ]);
  }

  return rows;
}

import { relativeAge } from "@/lib/timeFormat";
import type { FireData } from "./types";

export function buildFireDetailRows(
  data: FireData,
  timestamp?: string,
): [string, string][] {
  const rows: [string, string][] = [];

  if (data.frp != null && data.frp > 0) {
    rows.push(["FRP", `${data.frp.toFixed(1)} MW`]);
  }

  if (data.brightness != null && data.brightness > 0) {
    rows.push(["Brightness", `${data.brightness.toFixed(1)} K`]);
  }

  if (data.brightT31 != null && data.brightT31 > 0) {
    rows.push(["Bright T31", `${data.brightT31.toFixed(1)} K`]);
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
    rows.push(["Detection", data.daynight === "D" ? "DAYTIME" : "NIGHTTIME"]);
  }

  if (data.scan != null && data.track != null) {
    rows.push([
      "Pixel",
      `${data.scan.toFixed(1)} × ${data.track.toFixed(1)} km`,
    ]);
  }

  if (timestamp) {
    const ts = new Date(timestamp).getTime();
    const dateStr = new Date(timestamp).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    rows.push(["Detected", `${dateStr} (${relativeAge(ts, "verbose")})`]);
  }

  return rows;
}

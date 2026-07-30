import { relativeAge, formatTime } from "@/lib/format/timeFormat";
import { formatKtMph } from "@/lib/format/units";
import type { CycloneData } from "./types";
import { CATEGORY_LABEL } from "./classification";

export function buildCycloneDetailRows(
  data: CycloneData,
  timestamp?: string,
): [string, string][] {
  const rows: [string, string][] = [];

  rows.push(["Name", data.name]);
  rows.push(["Storm ID", data.stormId]);
  rows.push([
    "Classification",
    CATEGORY_LABEL[data.classification] ?? data.classification,
  ]);

  if (data.saffirSimpson > 0) {
    rows.push(["Category", String(data.saffirSimpson)]);
  }

  rows.push(["Winds", formatKtMph(data.maxWindKt)]);

  if (data.minPressureMb != null) {
    rows.push(["Pressure", `${data.minPressureMb} mb`]);
  }

  if (data.movementDir != null && data.movementSpeedKt != null) {
    rows.push([
      "Movement",
      `${data.movementDir}° at ${formatKtMph(data.movementSpeedKt)}`,
    ]);
  }

  rows.push(["Basin", data.basin]);
  if (data.advisoryNumber) {
    rows.push(["Advisory", data.advisoryNumber]);
  }

  if (timestamp) {
    const ts = new Date(timestamp).getTime();
    rows.push([
      "Issued",
      `${formatTime(timestamp)} (${relativeAge(ts, "verbose")})`,
    ]);
  }

  return rows;
}

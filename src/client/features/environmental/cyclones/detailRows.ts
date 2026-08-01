import { formatTimeWithAge } from "@/time";
import { formatKtMph } from "@/measurements";
import { formatBearingDeg, formatPressureMb } from "./formatters";
import { BLANK_SEPARATOR } from "@shared/text";
import { CycloneRowLabel, SaffirSimpson, type CycloneData } from "./types";
import { CATEGORY_LABEL } from "./classification";

const MOVEMENT_JOIN = `${BLANK_SEPARATOR}at${BLANK_SEPARATOR}`;

type CycloneRowReader = (
  data: CycloneData,
  timestamp: string | undefined,
) => string | undefined;

function movementText(data: CycloneData): string | undefined {
  const { movementDir, movementSpeedKt } = data;
  if (movementDir == null || movementSpeedKt == null) return undefined;
  return [formatBearingDeg(movementDir), formatKtMph(movementSpeedKt)].join(
    MOVEMENT_JOIN,
  );
}

const ROWS: readonly (readonly [CycloneRowLabel, CycloneRowReader])[] = [
  [CycloneRowLabel.Name, (data) => data.name],
  [CycloneRowLabel.StormId, (data) => data.stormId],
  [CycloneRowLabel.Classification, (data) => CATEGORY_LABEL[data.classification]],
  [
    CycloneRowLabel.Category,
    (data) =>
      data.saffirSimpson === SaffirSimpson.None
        ? undefined
        : String(data.saffirSimpson),
  ],
  [CycloneRowLabel.Winds, (data) => formatKtMph(data.maxWindKt)],
  [
    CycloneRowLabel.Pressure,
    (data) =>
      data.minPressureMb == null
        ? undefined
        : formatPressureMb(data.minPressureMb),
  ],
  [CycloneRowLabel.Movement, movementText],
  [CycloneRowLabel.Basin, (data) => data.basin],
  [CycloneRowLabel.Advisory, (data) => data.advisoryNumber],
  [CycloneRowLabel.Issued, (_data, timestamp) => formatTimeWithAge(timestamp)],
];

export function buildCycloneDetailRows(
  data: CycloneData,
  timestamp?: string,
): [string, string][] {
  const rows: [string, string][] = [];
  for (const [label, read] of ROWS) {
    const value = read(data, timestamp);
    if (value) rows.push([label, value]);
  }
  return rows;
}

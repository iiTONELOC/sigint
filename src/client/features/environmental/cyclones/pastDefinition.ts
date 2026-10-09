import { Domain } from "@shared/domain/identity";
import { History } from "lucide-react";
import {
  defineFeature,
  FeatureColorClassName,
  FeatureIconStyle,
} from "@/features/base/presentation";
import { formatKtMph } from "@/measurements";
import { formatTime } from "@/time";
import type { CyclonePastPointData } from "@shared/domain/cyclones";
import { BASIN_LABEL } from "@shared/cyclonesSeason";
import { BLANK_SEPARATOR } from "@shared/text";
import { categoryShort } from "./classification";
import { CyclonePointRowLabel } from "./forecastDefinition";
import {
  cycloneFeedPresentation,
  cycloneTablePresentation,
} from "./formatters/presentation";
import { formatPressureMb } from "./formatters/units";

export const PAST_POINT_LABEL = "PAST TRACK";

export function pastPointName(data: CyclonePastPointData, timestamp?: string): string {
  return timestamp
    ? `${data.parentName}${BLANK_SEPARATOR}${formatTime(timestamp)}`
    : data.parentName;
}

export const cyclonePastFeature = defineFeature<
  CyclonePastPointData,
  Domain.CyclonesPast
>({
  id: Domain.CyclonesPast,
  label: PAST_POINT_LABEL,
  icon: History,
  iconStyle: FeatureIconStyle.Stroked,
  colorClassName: FeatureColorClassName.Cyclones,
  includeInDataTable: false,
  TickerContent: () => null,

  buildDetailRows: (data: CyclonePastPointData, timestamp?: string) => {
    const pressureRow: [CyclonePointRowLabel, string][] =
      data.minPressureMb == null
        ? []
        : [[CyclonePointRowLabel.Pressure, formatPressureMb(data.minPressureMb)]];
    const timeRow: [CyclonePointRowLabel, string][] =
      timestamp ? [[CyclonePointRowLabel.Time, formatTime(timestamp)]] : [];
    const rows: [CyclonePointRowLabel, string][] = [
      [CyclonePointRowLabel.Storm, data.parentName],
      [CyclonePointRowLabel.Basin, BASIN_LABEL[data.parentBasin]],
      ...timeRow,
      [CyclonePointRowLabel.Winds, formatKtMph(data.maxWindKt)],
      ...pressureRow,
      [CyclonePointRowLabel.Class, categoryShort(data.maxWindKt)],
    ];
    return rows.map(([label, value]) => [label.toUpperCase(), value]);
  },
  tablePresentation: (data) =>
    cycloneTablePresentation(pastPointName(data), Domain.CyclonesPast),
  feedPresentation: (data) => cycloneFeedPresentation(pastPointName(data)),
});

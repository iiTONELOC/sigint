import type { CycloneData } from "@shared/domain/cyclones";
import { HOURS_PER_DAY, MS_PER_HOUR } from "@shared/time";
import { formatKtShort } from "@/measurements";
import { formatTimestamp } from "@/time";
import { formatPressureMb } from "../formatters/units";
import { trackHistory, type TrackHistory } from "../data/intensity";
import { IntensityChart, IntensityFactLabel, type IntensityFact, type IntensityPoint } from "./CycloneIntensityCurve";

const HISTORY_LINE_COLOR = "var(--dossier-accent)";

function historyPoints(history: TrackHistory): IntensityPoint[] {
  const latest = history.series.at(-1)?.observedAt ?? history.formedAt;
  return history.series.map((sample) => ({ hour: (sample.observedAt - latest) / MS_PER_HOUR, windKt: sample.windKt }));
}

function dayTicks(points: readonly IntensityPoint[]): number[] {
  const earliest = points[0]?.hour ?? 0;
  const ticks: number[] = [];
  for (let hour = -HOURS_PER_DAY; hour > earliest; hour -= HOURS_PER_DAY) ticks.unshift(hour);
  return ticks;
}

function historyFacts(history: TrackHistory): IntensityFact[] {
  const pressure: IntensityFact[] = history.lowestPressureMb === null
    ? []
    : [[IntensityFactLabel.LowestPressure, formatPressureMb(history.lowestPressureMb)]];
  return [
    [IntensityFactLabel.Formed, formatTimestamp(history.formedAt)],
    ...pressure,
    [IntensityFactLabel.BiggestGain, `+${formatKtShort(history.maxGain24hKt)}`],
  ];
}

/** Best-track history since formation. */
export function CycloneHistoryPanel({ storm }: Readonly<{ storm: CycloneData }>) {
  const history = trackHistory(storm);
  if (!history) return null;
  const points = historyPoints(history);
  return (
    <IntensityChart
      ariaLabel={`Best-track wind history: peak ${history.peakWindKt} knots over ${history.series.length} fixes`}
      count={`${history.series.length} FIXES`}
      facts={historyFacts(history)}
      lineColor={HISTORY_LINE_COLOR}
      markerHour={null}
      nowHour={null}
      points={points}
      ticks={dayTicks(points)}
    />
  );
}

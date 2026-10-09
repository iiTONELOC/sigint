import {
  CYCLONE_CATEGORY_METADATA,
  Category,
  saffirSimpsonForWind,
  type ForecastPoint,
} from "@shared/domain/cyclones";
import { MS_PER_HOUR } from "@shared/time";
import { formatHour, formatWeekday } from "@/time";
import { categoryShort, windColor } from "../classification";
import { leadTime, NOW_LABEL } from "../forecastDefinition";

const BAR_HEIGHT_BY_RANK: readonly string[] = ["h-3", "h-5", "h-7", "h-9", "h-11", "h-13", "h-15"];
const STORM_RANK = 1;

function intensityRank(windKt: number): number {
  const scale = saffirSimpsonForWind(windKt);
  if (scale > 0) return STORM_RANK + scale;
  return windKt >= CYCLONE_CATEGORY_METADATA[Category.TropicalStorm].minimumWindKt ? STORM_RANK : 0;
}

enum TimelineClassName {
  Label = "max-w-full truncate text-(length:--sig-text-xs)",
  Row = "flex items-end gap-1",
  Stop = "flex-1 min-w-0 flex flex-col items-center gap-1 rounded-md py-1 cursor-pointer",
  Bar = "w-full rounded-t-sm border-2 border-b-0 border-current",
  BarFill = "bg-current/15",
  BarFillSelected = "bg-current/35",
  Selected = "bg-sig-bright/5 outline outline-sig-border",
}

type TimelineStop = Readonly<{ hour: number; windKt: number; forecast: ForecastPoint | null }>;

type Props = Readonly<{
  currentWindKt: number;
  forecast: readonly ForecastPoint[];
  issuedAt: string;
  selectedHour: number | null;
  onSelect: (forecast: ForecastPoint | null) => void;
}>;

export function CycloneForecastTimeline({ currentWindKt, forecast, issuedAt, selectedHour, onSelect }: Props) {
  const issuedMs = Date.parse(issuedAt);
  const stops: TimelineStop[] = [
    { hour: 0, windKt: currentWindKt, forecast: null },
    ...forecast.map((point) => ({ hour: point.fcstHour, windKt: point.maxWindKt, forecast: point })),
  ];
  return (
    <div className="@container/timeline">
    <div className={TimelineClassName.Row}>
      {stops.map((stop) => {
        const selected = stop.forecast === null ? selectedHour === null : stop.hour === selectedHour;
        const validMs = issuedMs + stop.hour * MS_PER_HOUR;
        return (
          <button
            key={stop.hour}
            type="button"
            aria-pressed={selected}
            aria-label={`${stop.forecast ? leadTime(stop.hour) : NOW_LABEL} ${stop.windKt} kt ${categoryShort(stop.windKt)}`}
            onClick={() => onSelect(stop.forecast)}
            className={`${TimelineClassName.Stop} ${selected ? TimelineClassName.Selected : ""}`}
            style={{ color: windColor(stop.windKt) }}
          >
            <span className={`${TimelineClassName.Label} font-bold`}>{categoryShort(stop.windKt)}</span>
            <span className={`${TimelineClassName.Bar} ${BAR_HEIGHT_BY_RANK[intensityRank(stop.windKt)] ?? ""} ${selected ? TimelineClassName.BarFillSelected : TimelineClassName.BarFill}`} />
            <span className={`${TimelineClassName.Label} text-sig-bright font-mono`}>{stop.windKt}</span>
            <span className={`${TimelineClassName.Label} text-sig-dim`}>{stop.forecast ? leadTime(stop.hour) : NOW_LABEL}</span>
            {Number.isFinite(issuedMs) && (
              <>
                <span className={`${TimelineClassName.Label} text-sig-text`}>{formatWeekday(validMs)}</span>
                <span className={`${TimelineClassName.Label} text-sig-text`}>{formatHour(validMs)}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
    </div>
  );
}

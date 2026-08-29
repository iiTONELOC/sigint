import type { TrailTooltipState } from "@/components/globe/bridge/useSurfaceEvents";

export type TrailTooltipProps = Readonly<{
  state: TrailTooltipState | null;
}>;

enum TrailTooltipMetric {
  HorizontalOffset = 14,
  MaximumWidth = 200,
  MillisecondsPerMinute = 60_000,
  MinutesPerHour = 60,
  VerticalOffset = 40,
  ViewportInset = 4,
}

function ageText(timestamp: number): string {
  const minutes = Math.round(
    (Date.now() - timestamp) / TrailTooltipMetric.MillisecondsPerMinute,
  );
  if (minutes < 1) return "now";
  if (minutes < TrailTooltipMetric.MinutesPerHour) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / TrailTooltipMetric.MinutesPerHour);
  const remainingMinutes = minutes % TrailTooltipMetric.MinutesPerHour;
  return `${hours}h ${remainingMinutes}m ago`;
}

export function TrailTooltip({ state }: TrailTooltipProps) {
  const point = state?.point;
  if (!state || !point) return null;
  const snapshot = {
    ALT: point.altitude == null ? null : `${point.altitude} ft`,
    SPD: point.speed == null ? null : `${point.speed} kn`,
    HDG: point.heading == null ? null : `${point.heading}°`,
  };
  const snapshotEntries = Object.entries(snapshot).filter(
    (entry): entry is [string, string] => entry[1] !== null,
  );
  return (
    <div
      className="absolute pointer-events-none z-(--layer-floating) rounded px-2.5 py-1.5 bg-sig-panel/95 border border-sig-accent/40 backdrop-blur-sm text-(length:--sig-text-sm)"
      style={{
        left: Math.max(
          TrailTooltipMetric.ViewportInset,
          state.x + TrailTooltipMetric.HorizontalOffset,
        ),
        top: Math.max(
          TrailTooltipMetric.ViewportInset,
          state.y - TrailTooltipMetric.VerticalOffset,
        ),
        maxWidth: TrailTooltipMetric.MaximumWidth,
      }}
    >
      <div className="text-sig-accent tracking-wider mb-0.5">
        {new Date(point.ts).toLocaleTimeString("en-US", {
          hour12: false,
        })}
        <span className="text-sig-dim ml-1.5">
          {ageText(point.ts)}
        </span>
      </div>
      {snapshotEntries.map(([label, value]) => (
        <div key={label} className="text-sig-bright">
          {label} <span className="text-sig-text">{value}</span>
        </div>
      ))}
      {snapshotEntries.length === 0 && (
        <div className="text-sig-dim">No snapshot data</div>
      )}
      <div className="text-sig-dim mt-0.5">
        {Math.abs(point.lat).toFixed(3)}°
        {point.lat >= 0 ? "N" : "S"},{" "}
        {Math.abs(point.lon).toFixed(3)}°
        {point.lon >= 0 ? "E" : "W"}
      </div>
    </div>
  );
}

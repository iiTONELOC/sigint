import type { TrailTooltipState } from "@/components/globe/bridge/useSurfaceEvents";

export type TrailTooltipProps = Readonly<{
  state: TrailTooltipState | null;
}>;

function ageText(timestamp: number): string {
  const minutes = Math.round((Date.now() - timestamp) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}

export function TrailTooltip({ state }: TrailTooltipProps) {
  const point = state?.point;
  if (!state || !point) return null;
  return (
    <div
      className="absolute pointer-events-none z-30 rounded px-2.5 py-1.5 bg-sig-panel/95 border border-sig-accent/40 backdrop-blur-sm text-(length:--sig-text-sm)"
      style={{
        left: Math.max(4, state.x + 14),
        top: Math.max(4, state.y - 40),
        maxWidth: 200,
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
      {point.altitude != null && (
        <div className="text-sig-bright">
          ALT <span className="text-sig-text">{point.altitude} ft</span>
        </div>
      )}
      {point.speed != null && (
        <div className="text-sig-bright">
          SPD <span className="text-sig-text">{point.speed} kn</span>
        </div>
      )}
      {point.heading != null && (
        <div className="text-sig-bright">
          HDG <span className="text-sig-text">{point.heading}°</span>
        </div>
      )}
      {point.altitude == null &&
        point.speed == null &&
        point.heading == null && (
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

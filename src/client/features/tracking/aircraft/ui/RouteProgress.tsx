import type { CSSProperties } from "react";
import {
  MINUTES_PER_HOUR,
  MS_PER_SECOND,
  SECONDS_PER_MINUTE,
} from "@shared/time";
import { NO_VALUE } from "@shared/text";

function formatDuration(seconds: number): string {
  const boundedSeconds = Math.max(0, seconds);
  const secondsPerHour = MINUTES_PER_HOUR * SECONDS_PER_MINUTE;
  const hours = Math.floor(boundedSeconds / secondsPerHour);
  const minutes = Math.round(
    (boundedSeconds % secondsPerHour) / SECONDS_PER_MINUTE,
  );
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

type Props = {
  readonly origin: string;
  readonly dest: string;
  readonly departureTime?: number;
  readonly arrivalTime?: number;
};

export function RouteProgress({ origin, dest, departureTime, arrivalTime }: Props) {
  if (!departureTime || !arrivalTime || arrivalTime <= departureTime) return null;

  const now = Date.now() / MS_PER_SECOND;
  const fraction = Math.max(0, Math.min(1, (now - departureTime) / (arrivalTime - departureTime)));
  const percentage = fraction.toLocaleString("en-US", {
    style: "percent",
    maximumFractionDigits: 0,
  });
  const barStyle: CSSProperties = { width: percentage };
  const markerStyle: CSSProperties = { left: percentage };

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-(length:--sig-text-sm) font-semibold font-mono text-sig-bright">
          {origin || NO_VALUE}
        </span>
        <span className="text-(length:--sig-text-sm) font-semibold font-mono text-sig-bright">
          {dest || NO_VALUE}
        </span>
      </div>
      <div className="relative h-1.5 rounded-full bg-sig-border">
        <progress
          className="sr-only"
          max={1}
          value={fraction}
          aria-label={`Flight progress from ${origin || NO_VALUE} to ${dest || NO_VALUE}`}
        >
          {percentage}
        </progress>
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-(--dossier-accent)"
          style={barStyle}
        />
        <div
          className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--dossier-accent) border border-sig-bg"
          style={markerStyle}
        />
      </div>
      <div className="flex items-baseline justify-between mt-1.5 font-mono text-(length:--sig-text-xs) text-sig-dim">
        <span>+{formatDuration(now - departureTime)}</span>
        <span className="text-(--dossier-accent)">{percentage}</span>
        <span>-{formatDuration(arrivalTime - now)}</span>
      </div>
    </div>
  );
}

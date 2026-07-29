import { CycloneWarningSource } from "@/features/environmental/cyclones/warningSource";
import { WeatherAlertSource } from "@/features/environmental/weather/source";

export const weatherAlertSource = new WeatherAlertSource();
export const cycloneWarningSource = new CycloneWarningSource();

export type RebasableSource = Readonly<{ publishRebase: () => void }>;

/**
 * Every migrated geo source, in one place. The connect-render rebase iterates
 * this, so a source cannot be registered and then silently left out of the
 * first frame after the canvas connects.
 */
export const GEO_SOURCES: readonly RebasableSource[] = [
  weatherAlertSource,
  cycloneWarningSource,
];

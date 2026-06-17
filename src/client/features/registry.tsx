import type { FeatureDefinition } from "./base/types";
import { aircraftFeature } from "./tracking/aircraft";
import { earthquakeFeature } from "./environmental/earthquake";
import { shipsFeature } from "./tracking/ships";
import { eventsFeature } from "./intel/events";
import { firesFeature } from "./environmental/fires";
import { weatherFeature } from "./environmental/weather";
import {
  cycloneFeature,
  cycloneForecastFeature,
  cycloneWarningFeature,
} from "./environmental/cyclones";

// ── Registry ─────────────────────────────────────────────────────────

const features: FeatureDefinition<any, any>[] = [
  aircraftFeature,
  shipsFeature,
  eventsFeature,
  earthquakeFeature,
  firesFeature,
  weatherFeature,
  cycloneFeature,
  cycloneForecastFeature,
  // Not a data layer — synthetic feature so a clicked watch/warning polygon
  // resolves through the detail pipeline. Excluded from the Header toggles and
  // the DataTable filter (no points in allData). See inputHandlers.ts.
  cycloneWarningFeature,
];

export const featureRegistry = new Map<string, FeatureDefinition<any, any>>(
  features.map((f) => [f.id, f]),
);

export const featureList = features;

import type { FeatureDefinition } from "./base/types";
import { aircraftFeature } from "./tracking/aircraft";
import { earthquakeFeature } from "./environmental/earthquake";
import { shipsFeature } from "./tracking/ships";
import { eventsFeature } from "./intel/events";

// ── Registry ─────────────────────────────────────────────────────────

const features: FeatureDefinition<any, any>[] = [
  aircraftFeature,
  shipsFeature,
  eventsFeature,
  earthquakeFeature,
];

export const featureRegistry = new Map<string, FeatureDefinition<any, any>>(
  features.map((f) => [f.id, f]),
);

export const featureList = features;

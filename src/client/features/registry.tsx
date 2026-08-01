import type { DataType } from "./base/dataPoints";
import type { FeatureDefinition } from "./base/presentation";
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

const features: readonly FeatureDefinition[] = [
  aircraftFeature,
  shipsFeature,
  eventsFeature,
  earthquakeFeature,
  firesFeature,
  weatherFeature,
  cycloneFeature,
  cycloneForecastFeature,
  cycloneWarningFeature,
];

export const featureRegistry = new Map<DataType, FeatureDefinition>(
  features.map(
    (feature): readonly [DataType, FeatureDefinition] => [feature.id, feature],
  ),
);

export const featureList = features;

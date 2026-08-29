import type { DataType } from "./base/dataPoints";
import type { FeatureDefinition } from "./base/presentation";
import { Domain } from "@shared/domain/identity";
import { aircraftFeature } from "./tracking/aircraft/definition";
import { earthquakeFeature } from "./environmental/earthquake";
import { shipsFeature } from "./tracking/ships/definition";
import { eventsFeature } from "./intel/events";
import { firesFeature } from "./environmental/fires";
import { weatherFeature } from "./environmental/weather";
import { cycloneFeature } from "./environmental/cyclones/definition";
import { cycloneForecastFeature } from "./environmental/cyclones/forecastDefinition";
import { cycloneWarningFeature } from "./environmental/cyclones/warningDefinition";

export const featureRegistry: Readonly<Record<DataType, FeatureDefinition>> = {
  [Domain.Aircraft]: aircraftFeature,
  [Domain.Ships]: shipsFeature,
  [Domain.Events]: eventsFeature,
  [Domain.Quakes]: earthquakeFeature,
  [Domain.Fires]: firesFeature,
  [Domain.Weather]: weatherFeature,
  [Domain.Cyclones]: cycloneFeature,
  [Domain.CyclonesForecast]: cycloneForecastFeature,
  [Domain.CyclonesWarning]: cycloneWarningFeature,
};

export const featureList: readonly FeatureDefinition[] =
  Object.values(featureRegistry);

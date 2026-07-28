import type { Domain } from "./identity";

export type PointType =
  | Domain.Ships
  | Domain.Aircraft
  | Domain.Events
  | Domain.Quakes
  | Domain.Fires
  | Domain.Weather
  | Domain.Cyclones
  | Domain.CyclonesForecast
  | Domain.CyclonesWarning;

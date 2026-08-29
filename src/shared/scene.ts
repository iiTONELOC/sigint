import { SquawkStatus } from "./domain/aircraft";

export enum SceneGeometryKind {
  None = 0,
  Polygon = 1,
  Polyline = 2,
}

export enum ScenePositionOffset {
  Longitude = 0,
  Latitude = 1,
}

export const SCENE_POSITION_COUNT = ScenePositionOffset.Latitude + 1;

export enum SceneUnitVectorOffset {
  X = 0,
  Y = 1,
  Z = 2,
}

export const SCENE_UNIT_VECTOR_COUNT = SceneUnitVectorOffset.Z + 1;

export enum AircraftSceneAttribute {
  Heading = 0,
  Flags = 1,
  Squawk = 2,
}

export enum AircraftSceneStringAttribute {
  Country = 0,
}

export enum AircraftSceneFlag {
  Military = 1,
  Recon = 2,
  OnGround = 4,
}

export const AIRCRAFT_SCENE_SQUAWK_CODES: Readonly<
  Record<SquawkStatus, number>
> = {
  [SquawkStatus.Normal]: 0,
  [SquawkStatus.Emergency]: 1,
  [SquawkStatus.RadioFailure]: 2,
  [SquawkStatus.Hijack]: 3,
};

export enum ShipSceneAttribute {
  Heading = 0,
}

export enum MovingSceneAttribute {
  DirectionDegrees = 0,
  SpeedMetersPerSecond = 1,
}

export const MOVING_SCENE_ATTRIBUTE_COUNT =
  MovingSceneAttribute.SpeedMetersPerSecond + 1;

export const AIRCRAFT_MOTION_ATTRIBUTE_OFFSET =
  AircraftSceneAttribute.Squawk + 1;

export const AIRCRAFT_SCENE_ATTRIBUTE_COUNT =
  AIRCRAFT_MOTION_ATTRIBUTE_OFFSET + MOVING_SCENE_ATTRIBUTE_COUNT;

export const AIRCRAFT_SCENE_STRING_ATTRIBUTE_COUNT =
  AircraftSceneStringAttribute.Country + 1;

export const SHIP_MOTION_ATTRIBUTE_OFFSET =
  ShipSceneAttribute.Heading + 1;

export const SHIP_SCENE_ATTRIBUTE_COUNT =
  SHIP_MOTION_ATTRIBUTE_OFFSET + MOVING_SCENE_ATTRIBUTE_COUNT;

export enum EventSceneAttribute {
  Severity = 0,
}

export enum EarthquakeSceneAttribute {
  Magnitude = 0,
}

export const EARTHQUAKE_SCENE_ATTRIBUTE_COUNT =
  EarthquakeSceneAttribute.Magnitude + 1;

export enum FireSceneAttribute {
  RadiativePower = 0,
}

export const FIRE_SCENE_ATTRIBUTE_COUNT =
  FireSceneAttribute.RadiativePower + 1;

export enum WeatherSceneAttribute {
  Severity = 0,
}

export const WEATHER_SCENE_ATTRIBUTE_COUNT =
  WeatherSceneAttribute.Severity + 1;

export enum CycloneWarningSceneAttribute {
  Kind = 0,
}

export enum CycloneSceneRole {
  Current = 0,
  Forecast = 1,
  PastPath = 2,
  WindRadius = 3,
  ModelPath = 4,
}

export enum CycloneSceneAttribute {
  Role = 0,
  SaffirSimpson = 1,
  MaxWindKt = 2,
  ForecastHour = 3,
  ErrorRadiusNm = 4,
  WindThresholdKt = 5,
  WindRadiusNe = 6,
  WindRadiusSe = 7,
  WindRadiusSw = 8,
  WindRadiusNw = 9,
}

export const CYCLONE_SCENE_ATTRIBUTE_COUNT =
  CycloneSceneAttribute.WindRadiusNw + 1;

export enum CycloneSceneStringAttribute {
  ModelCode = 0,
}

export enum CycloneSceneIdToken {
  Separator = ":",
  ForecastPrefix = "CYF",
  ForecastHour = "-H",
  PastPath = "past-path",
  WindRadius = "wind-radius",
  ModelPath = "model-path",
}

export enum CycloneWindQuadrant {
  Northeast = 0,
  Southeast = 1,
  Southwest = 2,
  Northwest = 3,
}

export enum CycloneSceneDefault {
  Numeric = 0,
}

export enum CycloneSceneText {
  Empty = "",
}

function cycloneChildSceneId(
  parentId: string,
  ...parts: readonly (string | number)[]
): string {
  return [parentId, ...parts].join(CycloneSceneIdToken.Separator);
}

export function cycloneForecastSceneId(
  stormId: string,
  forecastHour: number,
): string {
  return [
    CycloneSceneIdToken.ForecastPrefix,
    stormId,
    CycloneSceneIdToken.ForecastHour,
    forecastHour,
  ].join(CycloneSceneText.Empty);
}

export function cyclonePastPathSceneId(parentId: string): string {
  return cycloneChildSceneId(
    parentId,
    CycloneSceneIdToken.PastPath,
  );
}

export function cycloneWindRadiusSceneId(
  parentId: string,
  threshold: number,
): string {
  return cycloneChildSceneId(
    parentId,
    CycloneSceneIdToken.WindRadius,
    threshold,
  );
}

export function cycloneModelPathSceneId(
  parentId: string,
  modelCode: string,
): string {
  return cycloneChildSceneId(
    parentId,
    CycloneSceneIdToken.ModelPath,
    modelCode,
  );
}

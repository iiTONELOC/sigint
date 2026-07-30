export enum CycloneSceneRole {
  Current = 0,
  Forecast = 1,
  ForecastPath = 2,
  PastPath = 3,
  WindRadius = 4,
  ModelPath = 5,
}

export enum CycloneSceneSchema {
  AttributeStride = 10,
  StringAttributeStride = 1,
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

export enum CycloneSceneStringAttribute {
  ModelCode = 0,
}

export enum CycloneSceneIdToken {
  Separator = ":",
  ForecastPrefix = "CYF",
  ForecastHour = "-H",
  ForecastPath = "forecast-path",
  PastPath = "past-path",
  WindRadius = "wind-radius",
  ModelPath = "model-path",
}

export enum CycloneWindThreshold {
  None = 0,
  Gale = 34,
  Storm = 50,
  Hurricane = 64,
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

export function cycloneForecastSceneId(
  stormId: string,
  forecastHour: number,
): string {
  return (
    CycloneSceneIdToken.ForecastPrefix +
    stormId +
    CycloneSceneIdToken.ForecastHour +
    forecastHour
  );
}

export function cycloneForecastPathSceneId(parentId: string): string {
  return [
    parentId,
    CycloneSceneIdToken.ForecastPath,
  ].join(CycloneSceneIdToken.Separator);
}

export function cyclonePastPathSceneId(parentId: string): string {
  return [
    parentId,
    CycloneSceneIdToken.PastPath,
  ].join(CycloneSceneIdToken.Separator);
}

export function cycloneWindRadiusSceneId(
  parentId: string,
  threshold: CycloneWindThreshold,
): string {
  return [
    parentId,
    CycloneSceneIdToken.WindRadius,
    threshold,
  ].join(CycloneSceneIdToken.Separator);
}

export function cycloneModelPathSceneId(
  parentId: string,
  modelCode: string,
): string {
  return [
    parentId,
    CycloneSceneIdToken.ModelPath,
    modelCode,
  ].join(CycloneSceneIdToken.Separator);
}

export type TrailMode = "off" | "selected" | "focused";

export interface ViewState {
  selectedEntityId?: string;
  isolatedEntityId?: string;
  hiddenProviderIds: Set<string>;
  trailMode: TrailMode;
  maxTrailPoints: number;
}

export interface CameraState {
  globeZoom: number;
  mapZoom: number;
}

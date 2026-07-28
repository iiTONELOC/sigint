/**
 * The alert's own polygon, kept so the renderer can draw the affected AREA
 * rather than just the centroid marker. Only storm-based alerts carry one.
 */
export type WeatherGeometry = Readonly<{
  type: string;
  coordinates: number[] | number[][] | number[][][];
}>;

export type WeatherData = {
  geometry?: WeatherGeometry;
  event?: string;
  severity?: string;
  certainty?: string;
  urgency?: string;
  headline?: string;
  description?: string;
  instruction?: string;
  senderName?: string;
  areaDesc?: string;
  onset?: string;
  expires?: string;
  status?: string;
  messageType?: string;
  category?: string;
  response?: string;
};

export type WeatherFilter = {
  enabled: boolean;
  minSeverity: number; // 0=all, 1=moderate+, 2=severe+, 3=extreme only
};

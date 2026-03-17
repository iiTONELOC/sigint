export type WeatherData = {
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

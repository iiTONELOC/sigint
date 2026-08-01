export enum FirePassLabel {
  Day = "day",
  DayTitle = "Day",
  DayUppercase = "DAY",
  Daytime = "DAYTIME",
  Night = "night",
  NightTitle = "Night",
  NightUppercase = "NIGHT",
  Nighttime = "NIGHTTIME",
}

export type FireData = {
  brightness?: number;
  frp?: number;
  confidence?: string;
  satellite?: string;
  instrument?: string;
  scan?: number;
  track?: number;
  brightT31?: number;
  daynight?: string;
  acqDate?: string;
  acqTime?: string;
  complexSize?: number;
  complexFrp?: number;
};

export type FireFilter = {
  enabled: boolean;
  minConfidence: number;
};

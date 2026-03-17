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
};

export type FireFilter = {
  enabled: boolean;
  minConfidence: number; // 0 = all, 1 = nominal+high, 2 = high only
};

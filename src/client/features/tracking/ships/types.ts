export enum AisHeading {
  Unavailable = 511,
}

export enum ShipDataLabel {
  Unknown = "Unknown",
}

export type ShipData = {
  mmsi?: number;
  imo?: number;
  name?: string;
  callSign?: string;
  vesselType?: string;
  shipTypeCode?: number;
  flag?: string;
  speed?: number;
  sog?: number;
  cog?: number;
  heading?: number;
  navStatus?: number;
  navStatusLabel?: string;
  rot?: number;
  destination?: string;
  draught?: number;
  eta?: string;
  length?: number;
  width?: number;
  dimA?: number;
  dimB?: number;
  dimC?: number;
  dimD?: number;
  speedMps?: number;
};

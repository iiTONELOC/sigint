import type { AircraftData } from "../aircraft/aircraftTypes";

export interface ProviderSnapshot<TEntity> {
  entities: TEntity[];
  lastUpdatedAt: number | null;
  loading: boolean;
  error: Error | null;
}

export interface DataProvider<TEntity> {
  readonly id: string;
  hydrate(): TEntity[] | null;
  refresh(): Promise<TEntity[]>;
  getData(): Promise<TEntity[]>;
  getSnapshot(): ProviderSnapshot<TEntity>;
}

export type DataType =
  | "ships"
  | "aircraft"
  | "events"
  | "quakes"
  | "satellites"
  | "cyber"
  | "bgp"
  | "radio";

export interface BasePoint {
  id: string;
  type: DataType;
  lat: number;
  lon: number;
  timestamp?: string;
}

export interface ShipData {
  name?: string;
  vesselType?: string;
  flag?: string;
  speed?: number;
  heading?: number;
}

export interface EventData {
  category?: string;
  headline?: string;
  source?: string;
  severity?: number;
}

export interface QuakeData {
  magnitude?: number;
  depth?: number;
  location?: string;
}

export type DataPoint =
  | (BasePoint & { type: "ships"; data: ShipData })
  | (BasePoint & { type: "aircraft"; data: AircraftData })
  | (BasePoint & { type: "events"; data: EventData })
  | (BasePoint & { type: "quakes"; data: QuakeData });

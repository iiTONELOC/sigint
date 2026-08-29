import { type PointType } from "@shared/domain/pointType";

// ── Base point shape ─────────────────────────────────────────────────

export type BasePoint = {
  id: string;
  type: PointType;
  lat: number;
  lon: number;
  timestamp?: string;
};

export enum IconStrokeWidth {
  None = 0,
  Standard = 2.5,
}

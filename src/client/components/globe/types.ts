import type {
  PanelSide,
} from "@/workers/render/protocol";
import type { DataPoint } from "@/features/base/dataPoints";

export type CamState = {
  rotY: number;
  rotX: number;
  vy: number;
  zoomGlobe: number;
  zoomFlat: number;
  panX: number;
  panY: number;
};

export type CamTarget = {
  rotY: number;
  rotX: number;
  zoom: number;
  panX: number;
  panY: number;
  active: boolean;
  lockedId: string | null;
};

export type DragState = {
  active: boolean;
  interactive: boolean;
  lx: number;
  ly: number;
  dist: number;
  sx: number;
  sy: number;
  pinching: boolean;
  pinchDist: number;
  lastClickTime: number;
  lastClickId: string | null;
};

export type GlobeVisualizationProps = {
  readonly selected: DataPoint | null;
  readonly onSelect: (item: DataPoint | null) => void;
  readonly onRawCanvasClick?: () => void;
  readonly onMiddleClick?: () => void;
  readonly onSelectedSide?: (side: PanelSide) => void;
  readonly zoomToId?: string | null;
  /** Gentle reveal: rotate to show the point without locking on. */
  readonly revealId?: string | null;
  readonly searchText: string | null;
  /** Tropical watch/warning area polygons (NWS Alerts GeoJSON). */
};

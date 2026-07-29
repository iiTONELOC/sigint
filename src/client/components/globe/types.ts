import type {
  PanelSide,
  SelectedIsolateMode,
} from "@/workers/render/protocol";
import type { DataPoint } from "@/features/base/dataPoints";
import type { AircraftFilter } from "@/features/tracking/aircraft";
import type { CycloneFilter } from "@/features/environmental/cyclones";
import type { EarthquakeFilter } from "@/features/environmental/earthquake/types";
import type { FireFilter } from "@/features/environmental/fires/types";

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
  readonly flat?: boolean;
  readonly autoRotate?: boolean;
  readonly rotationSpeed?: number;
  readonly layers: Record<string, boolean>;
  readonly aircraftFilter: AircraftFilter;
  readonly earthquakeFilter: EarthquakeFilter;
  readonly fireFilter: FireFilter;
  readonly cycloneFilter?: CycloneFilter;
  readonly selected: DataPoint | null;
  readonly isolatedId: string | null;
  readonly isolateMode: SelectedIsolateMode;
  readonly onSelect: (item: DataPoint | null) => void;
  readonly onRawCanvasClick?: () => void;
  readonly onMiddleClick?: () => void;
  readonly onSelectedSide?: (side: PanelSide) => void;
  readonly zoomToId?: string | null;
  /** Gentle reveal — rotate to show point at ISS-level zoom, no lock-on */
  readonly revealId?: string | null;
  readonly searchMatchIds?: Set<string> | null;
  /** Tropical watch/warning area polygons (NWS Alerts GeoJSON). */
};

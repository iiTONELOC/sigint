import type { DataPoint } from "@/features/base/dataPoints";
import type { AircraftFilter } from "@/features/tracking/aircraft";
import type { TrailPoint } from "@/lib/trailService";
import type { SpatialGrid } from "@/lib/spatialIndex";

export type Projected = {
  x: number;
  y: number;
  z: number;
};

export type ProjFn = (lat: number, lon: number) => Projected;

export type FlatGridConfig = {
  isFlat: true;
  accentColor?: string;
  cx: number;
  cy: number;
  mW: number;
  mH: number;
  mx: number;
  my: number;
};

type GlobeGridConfig = {
  isFlat: false;
  accentColor?: string;
};

export type GridConfig = FlatGridConfig | GlobeGridConfig;

export type HorizonCircle = {
  gcx: number;
  gcy: number;
  gr: number;
};

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
  readonly data: DataPoint[];
  readonly layers: Record<string, boolean>;
  readonly aircraftFilter: AircraftFilter;
  readonly selected: DataPoint | null;
  readonly isolatedId: string | null;
  readonly isolateMode: null | "solo" | "focus";
  readonly onSelect: (item: DataPoint | null) => void;
  readonly onRawCanvasClick?: () => void;
  readonly onMiddleClick?: () => void;
  readonly onSelectedSide?: (side: "left" | "right") => void;
  readonly zoomToId?: string | null;
  readonly searchMatchIds?: Set<string> | null;
  readonly spatialGrid: SpatialGrid;
  readonly filteredIds: Set<string>;
};

export type TrailHitTarget = {
  x: number;
  y: number;
  point: TrailPoint;
};

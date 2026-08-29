import type { PanelSide } from "@/layout-mode/model/layoutMode";
import type { DataPoint } from "@/features/base/dataPoints";

export type GlobeVisualizationProps = {
  readonly selected: DataPoint | null;
  readonly onSelect: (item: DataPoint | null) => void;
  readonly onRawCanvasClick?: () => void;
  readonly onMiddleClick?: () => void;
  readonly onSelectedSide?: (side: PanelSide) => void;
  readonly zoomToId?: string | null;
  readonly revealId?: string | null;
  readonly searchText: string | null;
};

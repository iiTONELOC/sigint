import { Anchor } from "lucide-react";
import type { FeatureDefinition } from "@/features/base/types";
import type { ShipData } from "./types";
import { buildShipDetailRows } from "./detailRows";
import { ShipTickerContent } from "./ui/ShipTickerContent";

export const shipsFeature: FeatureDefinition<ShipData, boolean> = {
  id: "ships",
  label: "AIS VESSELS",
  icon: Anchor,
  matchesFilter: (_item, enabled) => enabled,
  defaultFilter: true,
  buildDetailRows: (data) => buildShipDetailRows(data),
  TickerContent: ShipTickerContent,
  getSearchText: (data) =>
    [data.name, data.flag, data.vesselType].filter(Boolean).join(" "),
};

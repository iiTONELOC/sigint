import { Domain } from "@shared/domain/identity";
import { Anchor } from "lucide-react";
import type { FeatureDefinition } from "@/features/base/types";
import type { ShipData } from "./types";
import { buildShipDetailRows } from "./detailRows";
import { ShipTickerContent } from "./ui/ShipTickerContent";

export const shipsFeature: FeatureDefinition<ShipData, boolean, Domain.Ships> = {
  id: Domain.Ships,
  label: "AIS VESSELS",
  icon: Anchor,
  iconProps: { strokeWidth: 2.5 },
  buildDetailRows: (data) => buildShipDetailRows(data),
  TickerContent: ShipTickerContent,
  getSearchText: (data) =>
    [
      data.name,
      data.mmsi != null ? String(data.mmsi) : undefined,
      data.imo != null ? String(data.imo) : undefined,
      data.callSign,
      data.vesselType,
      data.destination,
      data.flag,
    ]
      .filter(Boolean)
      .join(" "),
};

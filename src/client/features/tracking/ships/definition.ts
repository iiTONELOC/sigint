import { Domain } from "@shared/domain/identity";
import { Anchor } from "lucide-react";
import {
  defineFeature,
  FeatureColorClassName,
  FeatureIconStyle,
} from "@/features/base/presentation";
import type { ShipData } from "./types";
import { buildShipDetailRows } from "./detailRows";
import { ShipTickerContent } from "./ui/ShipTickerContent";
import { shipFeedPresentation, shipTablePresentation } from "./formatters";

export const shipsFeature = defineFeature<ShipData, Domain.Ships>({
  id: Domain.Ships,
  label: "AIS VESSELS",
  icon: Anchor,
  iconStyle: FeatureIconStyle.Stroked,
  colorClassName: FeatureColorClassName.Ships,
  buildDetailRows: (data) => buildShipDetailRows(data),
  tablePresentation: shipTablePresentation,
  feedPresentation: shipFeedPresentation,
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
});

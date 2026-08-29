import { Domain } from "@shared/domain/identity";
import { Anchor } from "lucide-react";
import {
  defineFeature,
  FeatureColorClassName,
  FeatureIconStyle,
} from "@/features/base/presentation";
import type { ShipData } from "@shared/domain/ships";
import { ShipDetailSummary } from "./ui/ShipDetailSummary";
import { ShipTickerContent } from "./ui/ShipTickerContent";
import { shipFeedPresentation, shipPresentation } from "./formatters/presentation";

enum ShipSummaryText {
  UnknownVessel = "Unknown vessel",
}

export const shipsFeature = defineFeature<ShipData, Domain.Ships>({
  id: Domain.Ships,
  label: "AIS VESSELS",
  icon: Anchor,
  iconStyle: FeatureIconStyle.Stroked,
  colorClassName: FeatureColorClassName.Ships,
  DetailSummary: ShipDetailSummary,
  buildDetailRows: () => [],
  tablePresentation: shipPresentation,
  feedPresentation: shipFeedPresentation,
  TickerContent: ShipTickerContent,
  tickerSummary: (data) => [data.name || ShipSummaryText.UnknownVessel],
  getSearchText: (data) => shipPresentation(data, String(data.mmsi)).searchText,
  searchPresentation: (data, id) => {
    const presentation = shipPresentation(data, id);
    return {
      primary: presentation.name,
      secondary: presentation.classification,
    };
  },
});

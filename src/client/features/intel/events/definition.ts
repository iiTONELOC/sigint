import { Domain } from "@shared/domain/identity";
import { Zap } from "lucide-react";
import {
  defineFeature,
  FeatureColorClassName,
  FeatureIconStyle,
} from "@/features/base/presentation";
import type { EventData } from "./types";
import { buildEventDetailRows } from "./detailRows";
import { EventTickerContent } from "./ui/EventTickerContent";
import { eventFeedPresentation, eventTablePresentation } from "./formatters";

export const eventsFeature = defineFeature<EventData, Domain.Events>({
  id: Domain.Events,
  label: "GDELT EVENTS",
  icon: Zap,
  iconStyle: FeatureIconStyle.Filled,
  colorClassName: FeatureColorClassName.Events,
  includeInRawFeed: true,

  buildDetailRows: (data: EventData, ts?: string) =>
    buildEventDetailRows(data, ts),
  tablePresentation: eventTablePresentation,
  feedPresentation: eventFeedPresentation,

  TickerContent: EventTickerContent,

  getSearchText: (data: EventData) =>
    [
      data.headline,
      data.category,
      data.source,
      data.sourceCountry,
      data.locationName,
      data.language,
    ]
      .filter(Boolean)
      .join(" "),
});

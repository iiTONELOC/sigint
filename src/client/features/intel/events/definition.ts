import { Domain } from "@shared/domain/identity";
import { Zap } from "lucide-react";
import type { FeatureDefinition } from "@/features/base/types";
import type { EventData, EventFilter } from "./types";
import { buildEventDetailRows } from "./detailRows";
import { EventTickerContent } from "./ui/EventTickerContent";

export const eventsFeature: FeatureDefinition<EventData, EventFilter, Domain.Events> = {
  id: Domain.Events,
  label: "GDELT EVENTS",
  icon: Zap,
  iconProps: { fill: "currentColor", strokeWidth: 0 },



  buildDetailRows: (data: EventData, ts?: string) =>
    buildEventDetailRows(data, ts),

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
};

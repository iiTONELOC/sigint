import { Zap } from "lucide-react";
import type { FeatureDefinition, BasePoint } from "@/features/base/types";
import type { EventData, EventFilter } from "./types";
import { buildEventDetailRows } from "./detailRows";
import { EventTickerContent } from "./ui/EventTickerContent";

export const eventsFeature: FeatureDefinition<EventData, EventFilter> = {
  id: "events",
  label: "GDELT EVENTS",
  icon: Zap,

  matchesFilter: (
    _item: BasePoint & { data: EventData },
    filter: EventFilter,
  ) => {
    if (!filter.enabled) return false;
    const sev = _item.data?.severity;
    if (sev != null && filter.minSeverity > 0 && sev < filter.minSeverity) {
      return false;
    }
    return true;
  },

  defaultFilter: { enabled: true, minSeverity: 0 },

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

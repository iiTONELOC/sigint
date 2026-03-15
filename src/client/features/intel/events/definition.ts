import { Zap } from "lucide-react";
import type { FeatureDefinition } from "@/features/base/types";
import type { EventData } from "./types";
import { buildEventDetailRows } from "./detailRows";
import { EventTickerContent } from "./ui/EventTickerContent";

export const eventsFeature: FeatureDefinition<EventData, boolean> = {
  id: "events",
  label: "GDELT EVENTS",
  icon: Zap,
  matchesFilter: (_item, enabled) => enabled,
  defaultFilter: true,
  buildDetailRows: (data, ts) => buildEventDetailRows(data, ts),
  TickerContent: EventTickerContent,
  getSearchText: (data) =>
    [data.headline, data.category, data.source].filter(Boolean).join(" "),
};

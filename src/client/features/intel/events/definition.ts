import { Domain } from "@shared/domain/identity";
import { Zap } from "lucide-react";
import {
  defineFeature,
  FeatureColorClassName,
  FeatureIconStyle,
  FeaturePresentationText,
} from "@/features/base/presentation";
import type { EventData } from "@shared/domain/events";
import { EMPTY_TEXT } from "@shared/text";
import { buildEventDetailRows } from "./detailRows";
import { EventDetailSummary } from "./ui/EventDetailSummary";
import { EventTickerContent } from "./ui/EventTickerContent";
import {
  eventFeedPresentation,
  eventTablePresentation,
} from "./formatters/presentation";
import { eventSearchText } from "./data/uiQueries";

enum EventSummaryText {
  Fallback = "Event",
}

export const eventsFeature = defineFeature<EventData, Domain.Events>({
  id: Domain.Events,
  label: "GDELT EVENTS",
  icon: Zap,
  iconStyle: FeatureIconStyle.Filled,
  colorClassName: FeatureColorClassName.Events,
  includeInRawFeed: true,
  DetailSummary: EventDetailSummary,

  alertDetail: (data) => [data.headline || EMPTY_TEXT],
  buildDetailRows: buildEventDetailRows,
  tablePresentation: eventTablePresentation,
  feedPresentation: eventFeedPresentation,

  TickerContent: EventTickerContent,
  tickerSummary: (data) => [data.headline || EventSummaryText.Fallback],

  getSearchText: eventSearchText,
  searchPresentation: (data, id) => {
    const presentation = eventTablePresentation(data, id);
    return {
      primary: presentation.name,
      secondary: [presentation.classification, presentation.detail]
        .filter(Boolean)
        .join(FeaturePresentationText.Separator),
    };
  },
});

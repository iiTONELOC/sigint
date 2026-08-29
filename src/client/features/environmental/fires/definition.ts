import { Domain } from "@shared/domain/identity";
import { Flame } from "lucide-react";
import {
  defineFeature,
  FeatureColorClassName,
  FeatureIconStyle,
} from "@/features/base/presentation";
import type { FireData } from "@shared/domain/fireDayNight";
import { EMPTY_TEXT } from "@shared/text";
import { FireDetailSummary } from "./ui/FireDetailSummary";
import { FireTickerContent } from "./ui/FireTickerContent";
import {
  FireCopy,
  fireFeedPresentation,
  fireSearchText,
  fireTablePresentation,
  formatUnroundedFirePower,
} from "./formatters/presentation";

export const firesFeature = defineFeature<FireData, Domain.Fires>({
  id: Domain.Fires,
  label: "FIRES",
  icon: Flame,
  iconStyle: FeatureIconStyle.Stroked,
  colorClassName: FeatureColorClassName.Fires,
  includeInRawFeed: true,
  DetailSummary: FireDetailSummary,

  alertDetail: (data) => [
    data.satellite || FireCopy.DefaultSatellite,
    data.confidence || EMPTY_TEXT,
  ],
  buildDetailRows: () => [],
  tablePresentation: fireTablePresentation,
  feedPresentation: fireFeedPresentation,

  TickerContent: FireTickerContent,
  tickerSummary: (data) => {
    const summary: string[] = [FireCopy.Hotspot];
    if (data.frp != null) {
      summary.push(
        `${FireCopy.RadiativePower} ${formatUnroundedFirePower(data.frp)}`,
      );
    }
    return summary;
  },

  getSearchText: fireSearchText,
});

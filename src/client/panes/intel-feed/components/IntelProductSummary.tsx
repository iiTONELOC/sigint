import type { IntelProduct } from "@/lib/correlation";
import { IconStrokeWidth } from "@/features/base/types";
import { IntelFeedIconSize } from "../model/feed";
import { summarizeIntelProducts } from "../utils/products";

export function IntelProductSummary({
  products,
}: {
  readonly products: readonly IntelProduct[];
}) {
  const summaries = summarizeIntelProducts(products);
  if (summaries.length === 0) return null;

  return (
    <div className="px-3 py-2 border-b border-sig-border/30 text-(length:--sig-text-sm) text-sig-dim flex items-center gap-3 flex-wrap">
      {summaries.map(({ count, presentation, type }) => {
        const Icon = presentation.icon;
        return (
          <span key={type}>
            <Icon
              size={IntelFeedIconSize.Compact}
              className="inline mr-1"
              strokeWidth={IconStrokeWidth.Standard}
            />
            {count} {presentation.summaryLabel}
          </span>
        );
      })}
    </div>
  );
}

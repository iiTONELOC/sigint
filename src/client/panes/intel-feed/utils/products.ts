import type { IntelProduct } from "@/lib/correlation";
import { IntelProductType } from "@shared/domain/correlation";
import { INTEL_PRODUCT_PRESENTATION, type IntelProductPresentation } from "../model/feed";

export type IntelProductSummary = Readonly<{
  count: number;
  presentation: IntelProductPresentation;
  type: IntelProductType;
}>;

export function summarizeIntelProducts(
  products: readonly IntelProduct[],
): readonly IntelProductSummary[] {
  const counts = new Map<IntelProductType, number>();
  for (const type of Object.values(IntelProductType)) counts.set(type, 0);
  for (const product of products) {
    counts.set(product.type, (counts.get(product.type) ?? 0) + 1);
  }

  const summaries: IntelProductSummary[] = [];
  for (const type of Object.values(IntelProductType)) {
    const presentation = INTEL_PRODUCT_PRESENTATION[type];
    const count = counts.get(type) ?? 0;
    if (presentation.summaryLabel && count > 0) {
      summaries.push({ count, presentation, type });
    }
  }
  return summaries;
}

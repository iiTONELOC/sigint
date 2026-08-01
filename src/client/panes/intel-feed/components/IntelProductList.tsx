import { useEffect, useRef } from "react";
import { Eye } from "lucide-react";
import type { MouseEvent } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { IconStrokeWidth } from "@/features/base/types";
import type { IntelProduct } from "@/lib/correlation";
import { DomScrollBehavior, DomScrollBlock } from "@/runtime";
import { IntelFeedCopy, IntelFeedIconSize } from "../model";
import { IntelProductRow } from "./IntelProductRow";
import { IntelProductSummary } from "./IntelProductSummary";

type IntelProductListProps = Readonly<{
  expandedId: string | null;
  isIntelActive: boolean;
  onItemClick: (item: DataPoint) => void;
  onToggleExpand: (id: string) => void;
  onZoomTo: (item: DataPoint, event: MouseEvent) => void;
  products: readonly IntelProduct[];
  selectedId: string | null;
  watchTargetProductId: string | null;
}>;

export function IntelProductList({
  expandedId,
  isIntelActive,
  onItemClick,
  onToggleExpand,
  onZoomTo,
  products,
  selectedId,
  watchTargetProductId,
}: IntelProductListProps) {
  const watchTargetRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!watchTargetRef.current || !isIntelActive) return;
    watchTargetRef.current.scrollIntoView({
      behavior: DomScrollBehavior.Smooth,
      block: DomScrollBlock.Nearest,
    });
  }, [isIntelActive, watchTargetProductId]);

  return (
    <div className="flex-1 overflow-y-auto sigint-scroll">
      <IntelProductSummary products={products} />
      {products.map((product) => {
        const watchTarget = watchTargetProductId === product.id;
        return (
          <IntelProductRow
            key={product.id}
            expanded={expandedId === product.id}
            onItemClick={onItemClick}
            onToggleExpand={onToggleExpand}
            onZoomTo={onZoomTo}
            product={product}
            selectedId={selectedId}
            watchTarget={watchTarget}
            {...(watchTarget ? { watchTargetRef } : {})}
          />
        );
      })}
      {products.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-sig-dim">
          <Eye
            size={IntelFeedIconSize.Empty}
            strokeWidth={IconStrokeWidth.Standard}
            className="opacity-20 mb-2"
          />
          <span className="text-(length:--sig-text-md)">
            {IntelFeedCopy.NoProducts}
          </span>
          <span className="text-(length:--sig-text-sm) mt-1 text-center px-4">
            {IntelFeedCopy.CorrelationHint}
          </span>
        </div>
      )}
    </div>
  );
}

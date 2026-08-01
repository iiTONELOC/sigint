import type { MouseEvent, Ref } from "react";
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Locate,
  Newspaper,
} from "lucide-react";
import { DomAnchorTarget, DomLinkRelation } from "@/runtime";
import { ButtonType } from "@/lib/ui/button";
import type { DataPoint } from "@/features/base/dataPoints";
import { IconStrokeWidth } from "@/features/base/types";
import { featureRegistry } from "@/features/registry";
import {
  CORRELATION_POLICY,
  type IntelProduct,
} from "@/lib/correlation";
import {
  INTEL_PRODUCT_PRESENTATION,
  IntelFeedClassName,
  IntelFeedCopy,
  IntelFeedIconSize,
  intelProductRowClassName,
} from "../model";
import { IntelPriorityBadge } from "./IntelFeedBadges";

type IntelProductRowProps = Readonly<{
  expanded: boolean;
  onItemClick: (item: DataPoint) => void;
  onToggleExpand: (id: string) => void;
  onZoomTo: (item: DataPoint, event: MouseEvent) => void;
  product: IntelProduct;
  selectedId: string | null;
  watchTarget: boolean;
  watchTargetRef?: Ref<HTMLDivElement>;
}>;

export function IntelProductRow({
  expanded,
  onItemClick,
  onToggleExpand,
  onZoomTo,
  product,
  selectedId,
  watchTarget,
  watchTargetRef,
}: IntelProductRowProps) {
  const productPresentation = INTEL_PRODUCT_PRESENTATION[product.type];
  const ProductIcon = productPresentation.icon;
  const firstSource = product.sources[0];
  const hasGeographicSource = firstSource !== undefined;
  const selected = product.sources.some(
    (source) => source.id === selectedId,
  );
  const sourceCount = product.sourceCount ?? product.sources.length;

  return (
    <div
      ref={watchTargetRef}
      className={`${IntelFeedClassName.ProductContainer} ${
        watchTarget ? IntelFeedClassName.ProductWatchRing : ""
      }`}
    >
      <button
        type={ButtonType.Button}
        onClick={() => {
          onToggleExpand(product.id);
          if (firstSource) onItemClick(firstSource);
        }}
        className={`${IntelFeedClassName.ProductButton} ${intelProductRowClassName(
          { expanded, selected, watchTarget },
        )}`}
      >
        <div className="flex items-center gap-2">
          <ProductIcon
            size={IntelFeedIconSize.Standard}
            strokeWidth={IconStrokeWidth.Standard}
            className="text-sig-accent shrink-0"
          />
          <span className="text-(length:--sig-text-sm) font-bold tracking-widest text-sig-accent shrink-0">
            {productPresentation.label}
          </span>
          <IntelPriorityBadge priority={product.priority} />
          {!hasGeographicSource && (
            <span className="text-(length:--sig-text-sm) tracking-wider text-sig-dim bg-sig-dim/10 border border-sig-dim/20 rounded px-1 py-0 shrink-0">
              {IntelFeedCopy.NonGeographic}
            </span>
          )}
          <span
            className={`${IntelFeedClassName.SecondaryText} shrink-0 ml-auto`}
          >
            {product.region}
          </span>
        </div>
        <div className="text-sig-bright text-(length:--sig-text-md) mt-1 leading-snug">
          {product.title}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={IntelFeedClassName.SecondaryText}>
            {product.summary}
          </span>
          <span className="ml-auto shrink-0 text-sig-dim">
            {expanded ? (
              <ChevronDown
                size={IntelFeedIconSize.Standard}
                strokeWidth={IconStrokeWidth.Standard}
              />
            ) : (
              <ChevronRight
                size={IntelFeedIconSize.Standard}
                strokeWidth={IconStrokeWidth.Standard}
              />
            )}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-2 space-y-1">
          {hasGeographicSource && (
            <div className="pl-2 border-l-2 border-sig-accent/20 space-y-1">
              {product.sources
                .slice(0, CORRELATION_POLICY.sourcePreviewLimit)
                .map((source) => {
                  const feature = featureRegistry.get(source.type);
                  if (!feature) return null;
                  const SourceIcon = feature.icon;
                  const sourcePresentation = feature.feedPresentation(
                    source.data,
                    source.id,
                  );
                  return (
                    <div
                      key={source.id}
                      className="flex items-center gap-2 py-0.5 hover:bg-sig-panel/30 rounded px-1 transition-colors"
                    >
                      <button
                        type={ButtonType.Button}
                        onClick={(event) => {
                          event.stopPropagation();
                          onItemClick(source);
                        }}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer bg-transparent border-none"
                      >
                        <SourceIcon
                          size={IntelFeedIconSize.Compact}
                          strokeWidth={IconStrokeWidth.Standard}
                          className={`shrink-0 ${feature.colorClassName}`}
                        />
                        <span className="text-(length:--sig-text-sm) text-sig-text truncate flex-1">
                          {sourcePresentation.headline}
                        </span>
                      </button>
                      <button
                        type={ButtonType.Button}
                        onClick={(event) => onZoomTo(source, event)}
                        className="p-0.5 rounded text-sig-dim hover:text-sig-accent transition-colors shrink-0"
                        title={IntelFeedCopy.ZoomTo}
                      >
                        <Locate
                          size={IntelFeedIconSize.Compact}
                          strokeWidth={IconStrokeWidth.Standard}
                        />
                      </button>
                    </div>
                  );
                })}
              {sourceCount > product.sources.length && (
                <div className="text-(length:--sig-text-sm) text-sig-dim px-1">
                  +{sourceCount - product.sources.length} {IntelFeedCopy.More}
                </div>
              )}
            </div>
          )}

          {product.newsLinks && product.newsLinks.length > 0 && (
            <div className="pl-2 border-l-2 border-sig-accent/20 space-y-1 mt-1">
              <div className="text-(length:--sig-text-sm) text-sig-dim tracking-wider font-semibold">
                {IntelFeedCopy.RelatedNews}
              </div>
              {product.newsLinks.map((article) => (
                <a
                  key={article.id}
                  href={article.url}
                  target={DomAnchorTarget.Blank}
                  rel={DomLinkRelation.NoopenerNoreferrer}
                  onClick={(event) => event.stopPropagation()}
                  className="flex items-center gap-2 py-0.5 text-(length:--sig-text-sm) text-sig-accent hover:text-sig-bright transition-colors"
                >
                  <Newspaper
                    size={IntelFeedIconSize.Compact}
                    strokeWidth={IconStrokeWidth.Standard}
                    className="shrink-0"
                  />
                  <span className="truncate flex-1">{article.title}</span>
                  <ExternalLink
                    size={IntelFeedIconSize.Small}
                    strokeWidth={IconStrokeWidth.Standard}
                    className="shrink-0 opacity-50"
                  />
                </a>
              ))}
            </div>
          )}

          {!hasGeographicSource &&
            (!product.newsLinks || product.newsLinks.length === 0) && (
              <div className="pl-2 border-l-2 border-sig-dim/20 py-1">
                <span className="text-(length:--sig-text-sm) text-sig-dim">
                  {IntelFeedCopy.NoGeographicData}
                </span>
              </div>
            )}
        </div>
      )}
    </div>
  );
}

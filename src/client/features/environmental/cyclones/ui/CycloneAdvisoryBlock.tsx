import { DossierCollapsibleSection } from "@/dossier";
import type {
  CycloneDossierBundle,
  CycloneDossierProductBody,
} from "@shared/domain/cyclones";

type ProductSectionProps = Readonly<{
  title: string;
  product: CycloneDossierProductBody | undefined;
  loadingCopy: string | null;
  emptyCopy: string | null;
  compact: boolean;
  hideWhenMissing: boolean;
}>;

function ProductSection({
  title,
  product,
  loadingCopy,
  emptyCopy,
  compact,
  hideWhenMissing,
}: ProductSectionProps) {
  if (!product && hideWhenMissing) return null;
  const status = product ? null : (loadingCopy ?? emptyCopy);

  return (
    <DossierCollapsibleSection title={title} defaultOpen={false}>
      {product ? (
        <pre
          className={
            compact
              ? "text-(length:--sig-text-xs) text-sig-text whitespace-pre-wrap font-mono max-h-48 overflow-y-auto sigint-scroll"
              : "text-(length:--sig-text-xs) text-sig-text whitespace-pre-wrap font-mono max-h-64 overflow-y-auto"
          }
        >
          {product.body}
        </pre>
      ) : null}
      {status ? (
        <div
          className={
            compact
              ? "text-sig-text text-(length:--sig-text-sm)"
              : "text-(length:--sig-text-xs) text-sig-text"
          }
          aria-live={loadingCopy ? "polite" : undefined}
        >
          {status}
        </div>
      ) : null}
    </DossierCollapsibleSection>
  );
}

export function CycloneAdvisoryBlock({
  dossier,
  loading,
  compact,
}: Readonly<{
  dossier: CycloneDossierBundle | null;
  loading: boolean;
  compact: boolean;
}>) {
  const advisory = dossier?.advisory;
  const dossierLoadingCopy = loading ? "Loading…" : null;
  const products = (
    <>
      <ProductSection
        title={compact && advisory ? `ADVISORY ${advisory.advisoryNumber}` : "ADVISORY"}
        product={advisory}
        loadingCopy={compact && loading ? "Loading advisory…" : dossierLoadingCopy}
        emptyCopy={compact ? "No advisory available" : null}
        compact={compact}
        hideWhenMissing={false}
      />
      <ProductSection
        title={compact ? "DISCUSSION" : "FORECAST DISCUSSION"}
        product={dossier?.discussion}
        loadingCopy={compact ? null : dossierLoadingCopy}
        emptyCopy={null}
        compact={compact}
        hideWhenMissing={compact}
      />
    </>
  );
  return compact ? (
    <div className="mt-1.5 pt-1.5 border-t border-sig-border space-y-2">
      {products}
    </div>
  ) : products;
}

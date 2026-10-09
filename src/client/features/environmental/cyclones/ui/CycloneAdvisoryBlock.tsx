import { useState } from "react";
import { DossierCard, DossierCollapsibleSection } from "@/dossier";
import {
  CycloneDossierProductKind,
  type CycloneDossierBundle,
  type CycloneDossierProductBody,
} from "@shared/domain/cyclones";
import { spacedUpperCase } from "@shared/text";

const LIVE_REGION = "polite";

const PRODUCT_KINDS: readonly CycloneDossierProductKind[] = Object.values(CycloneDossierProductKind);

enum AdvisoryCopy {
  Loading = "Loading…",
  LoadingAdvisory = "Loading advisory…",
  NoAdvisory = "No advisory available",
}

enum AdvisoryClassName {
  Body = "text-(length:--sig-text-xs) text-sig-text whitespace-pre-wrap wrap-anywhere font-mono",
  Status = "text-(length:--sig-text-xs) text-sig-text",
  Tab = "text-(length:--sig-text-xs) tracking-wider px-2 py-0.5 rounded border cursor-pointer",
  TabOn = "border-(--dossier-accent) text-(--dossier-accent)",
  TabOff = "border-sig-border text-sig-dim hover:text-sig-bright",
}

function ProductBody({ product }: Readonly<{ product: CycloneDossierProductBody }>) {
  return <pre className={AdvisoryClassName.Body}>{product.body}</pre>;
}

function CompactProducts({ dossier, loading }: Readonly<{ dossier: CycloneDossierBundle | null; loading: boolean }>) {
  const advisory = dossier?.advisory;
  return (
    <div className="mt-1.5 pt-1.5 border-t border-sig-border space-y-2">
      <DossierCollapsibleSection title={advisory ? `ADVISORY ${advisory.advisoryNumber}` : spacedUpperCase(CycloneDossierProductKind.Advisory)} defaultOpen={false}>
        {advisory ? <ProductBody product={advisory} /> : (
          <div className={AdvisoryClassName.Status} aria-live={LIVE_REGION}>
            {loading ? AdvisoryCopy.LoadingAdvisory : AdvisoryCopy.NoAdvisory}
          </div>
        )}
      </DossierCollapsibleSection>
      {PRODUCT_KINDS.filter((kind) => kind !== CycloneDossierProductKind.Advisory).map((kind) => {
        const product = dossier?.[kind];
        return product ? (
          <DossierCollapsibleSection key={kind} title={spacedUpperCase(kind)} defaultOpen={false}>
            <ProductBody product={product} />
          </DossierCollapsibleSection>
        ) : null;
      })}
    </div>
  );
}

function TabbedProducts({ dossier, loading }: Readonly<{ dossier: CycloneDossierBundle | null; loading: boolean }>) {
  const available = PRODUCT_KINDS.filter((kind) => dossier?.[kind]);
  const [chosen, setChosen] = useState(CycloneDossierProductKind.Advisory);
  const active = available.includes(chosen) ? chosen : available[0];
  const product = active ? dossier?.[active] : undefined;
  return (
    <DossierCard className="p-3 flex flex-col gap-2">
      {available.length > 0 && (
        <div role="tablist" className="flex flex-wrap gap-1.5">
          {available.map((kind) => (
            <button
              key={kind}
              type="button"
              role="tab"
              aria-selected={kind === active}
              onClick={() => setChosen(kind)}
              className={`${AdvisoryClassName.Tab} ${kind === active ? AdvisoryClassName.TabOn : AdvisoryClassName.TabOff}`}
            >
              {spacedUpperCase(kind)}
            </button>
          ))}
        </div>
      )}
      {product ? <ProductBody product={product} /> : loading && (
        <div className={AdvisoryClassName.Status} aria-live={LIVE_REGION}>{AdvisoryCopy.Loading}</div>
      )}
    </DossierCard>
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
  return compact
    ? <CompactProducts dossier={dossier} loading={loading} />
    : <TabbedProducts dossier={dossier} loading={loading} />;
}

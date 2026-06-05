// ── CycloneAdvisoryBlock ────────────────────────────────────────────
// NHC Public Advisory + Forecast Discussion text in the compact cyclone
// detail panel. Each is a collapsible section (collapsed by default) so the
// panel stays glanceable and the long bulletins don't dominate the scroll —
// the same hierarchy the dossier uses. Lazy-loads via useCycloneDossier
// (same 60-min cached bundle), so selecting a storm fetches once.

import { CollapsibleSection } from "@/panes/dossier/DossierAtoms";
import { useCycloneDossier } from "../hooks/useCycloneDossier";

export function CycloneAdvisoryBlock({
  stormId,
}: {
  readonly stormId: string | null | undefined;
}) {
  const { dossier, loading } = useCycloneDossier(stormId);
  const advisory = dossier?.advisory;
  const discussion = dossier?.discussion;

  if (!stormId) return null;

  const advisoryTitle = advisory
    ? `ADVISORY ${advisory.advisoryNumber}`
    : "ADVISORY";

  return (
    <div className="mt-1.5 pt-1.5 border-t border-sig-border space-y-2">
      <CollapsibleSection title={advisoryTitle} defaultOpen={false}>
        {advisory ? (
          <pre className="text-xs text-sig-text whitespace-pre-wrap font-mono max-h-48 overflow-y-auto sigint-scroll">
            {advisory.body}
          </pre>
        ) : (
          <div className="text-sig-text text-(length:--sig-text-sm)">
            {loading ? "Loading advisory…" : "No advisory available"}
          </div>
        )}
      </CollapsibleSection>

      {discussion ? (
        <CollapsibleSection title="DISCUSSION" defaultOpen={false}>
          <pre className="text-xs text-sig-text whitespace-pre-wrap font-mono max-h-48 overflow-y-auto sigint-scroll">
            {discussion.body}
          </pre>
        </CollapsibleSection>
      ) : null}
    </div>
  );
}

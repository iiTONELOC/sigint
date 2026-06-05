// ── CycloneAdvisoryBlock ────────────────────────────────────────────
// Shows the NHC Public Advisory (and Forecast Discussion) text inline in
// the compact cyclone detail panel — bounded height with scroll for the
// rest, so the full bulletin is readable without opening the dossier.
// Lazy-loads via useCycloneDossier (same 60-min cached bundle the dossier
// uses), so selecting a storm fetches once and a re-select is instant.

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

  return (
    <div className="mt-1.5 pt-1.5 border-t border-sig-border">
      <div className="uppercase tracking-wide text-sig-dim text-(length:--sig-text-sm) mb-1">
        Advisory{advisory ? ` ${advisory.advisoryNumber}` : ""}
      </div>
      {advisory ? (
        <pre className="text-xs text-sig-text whitespace-pre-wrap font-mono max-h-32 md:max-h-48 overflow-y-auto sigint-scroll">
          {advisory.body}
        </pre>
      ) : (
        <div className="text-sig-dim text-(length:--sig-text-sm)">
          {loading ? "Loading advisory…" : "No advisory available"}
        </div>
      )}

      {discussion ? (
        <>
          <div className="uppercase tracking-wide text-sig-dim text-(length:--sig-text-sm) mt-2 mb-1">
            Discussion
          </div>
          <pre className="text-xs text-sig-text whitespace-pre-wrap font-mono max-h-32 md:max-h-48 overflow-y-auto sigint-scroll">
            {discussion.body}
          </pre>
        </>
      ) : null}
    </div>
  );
}

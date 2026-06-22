import { relativeAge, formatTime } from "@/lib/format/timeFormat";
import type { CycloneData } from "../types";
import { CATEGORY_LABEL } from "../classification";
import { CycloneWarningFlags } from "./CycloneWarningFlags";

// Identity placard — the always-first card. Category-colored top edge + CAT
// badge (both ride var(--dossier-accent), which the dossier sets to
// windColor(maxWindKt)). Name, kicker, STORM ID / BASIN pairs, advisory footer.

const BASIN_LABEL: Record<string, string> = {
  AL: "Atlantic",
  EP: "East Pacific",
  CP: "Central Pacific",
};

/** Kicker like "HURRICANE · MAJOR" / "TROPICAL STORM" from the classification. */
function kicker(d: CycloneData): string {
  const label = (CATEGORY_LABEL[d.classification] ?? d.classification).toUpperCase();
  if (label.startsWith("HURRICANE")) {
    return d.saffirSimpson >= 3 ? "HURRICANE · MAJOR" : "HURRICANE";
  }
  return label.replace(/\s*\(.*\)\s*/, "");
}

export function CyclonePlacard({
  data,
  issued,
  compact = false,
}: {
  readonly data: CycloneData;
  readonly issued?: string;
  readonly compact?: boolean;
}) {
  const badge = data.saffirSimpson > 0 ? String(data.saffirSimpson) : data.classification;
  const issuedAge = issued
    ? `${formatTime(issued)} · ${relativeAge(new Date(issued).getTime(), "verbose")}`
    : null;

  if (compact) {
    return (
      <div className="relative flex items-center gap-3 border border-(--dossier-accent)/40 rounded-xl overflow-hidden bg-sig-panel px-3 py-2">
        <div className="absolute inset-0 bg-(--dossier-accent)/8 pointer-events-none" />
        <div className="absolute left-0 inset-y-0 w-1 bg-(--dossier-accent)" />
        <div className="relative flex flex-col items-center justify-center w-10 h-10 shrink-0 rounded-[10px] border-2 border-(--dossier-accent) text-(--dossier-accent)">
          <span className="text-(length:--sig-text-md) font-bold leading-none">{badge}</span>
          {data.saffirSimpson > 0 && (
            <span className="text-[8px] tracking-widest leading-none mt-0.5">CAT</span>
          )}
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="text-(length:--sig-text-xs) tracking-widest text-(--dossier-accent) font-semibold truncate">
            {kicker(data)}
          </div>
          <div className="text-(length:--sig-text-md) text-sig-bright font-bold tracking-wide leading-tight truncate">
            {data.name}
          </div>
          <div className="text-(length:--sig-text-xs) text-sig-dim font-mono truncate">
            {data.stormId} · {BASIN_LABEL[data.basin] ?? data.basin} · ADV {data.advisoryNumber || "—"}
          </div>
        </div>
        <CycloneWarningFlags maxWindKt={data.maxWindKt} isHurricane={data.saffirSimpson > 0} />
      </div>
    );
  }

  return (
    <div className="relative border border-(--dossier-accent)/40 rounded-2xl overflow-hidden bg-sig-panel">
      <div className="absolute inset-0 bg-(--dossier-accent)/8 pointer-events-none" />
      <div className="relative h-1 bg-(--dossier-accent)" />
      <div className="relative px-4 pt-3 pb-3">
        <div className="absolute top-3 right-3 flex items-center gap-2">
          <CycloneWarningFlags maxWindKt={data.maxWindKt} isHurricane={data.saffirSimpson > 0} />
          <div className="flex flex-col items-center justify-center w-14 h-14 rounded-[12px] border-2 border-(--dossier-accent) text-(--dossier-accent)">
            <span className="text-(length:--sig-text-title) font-bold leading-none">{badge}</span>
            {data.saffirSimpson > 0 && (
              <span className="text-(length:--sig-text-xs) tracking-widest mt-0.5">CAT</span>
            )}
          </div>
        </div>
        <div className="pr-28 text-(length:--sig-text-xs) tracking-widest text-(--dossier-accent) font-semibold truncate">
          {kicker(data)}
        </div>
        <div className="pr-28 text-(length:--sig-text-cqtitle) text-sig-bright font-bold tracking-wide leading-none mt-1 mb-3 truncate">
          {data.name}
        </div>
        <div className="flex gap-6">
          <div>
            <div className="text-(length:--sig-text-xs) tracking-wider text-sig-dim">STORM ID</div>
            <div className="text-(length:--sig-text-md) text-sig-bright font-mono mt-0.5">{data.stormId}</div>
          </div>
          <div>
            <div className="text-(length:--sig-text-xs) tracking-wider text-sig-dim">BASIN</div>
            <div className="text-(length:--sig-text-md) text-sig-bright mt-0.5">
              {BASIN_LABEL[data.basin] ?? data.basin}
            </div>
          </div>
        </div>
      </div>
      <div className="relative flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-(--dossier-accent)/20 bg-sig-bg/40 px-4 py-2 text-(length:--sig-text-xs) text-sig-dim">
        <span className="shrink-0">ADVISORY <span className="text-sig-text">{data.advisoryNumber || "—"}</span></span>
        {issuedAge && (
          <span className="min-w-0">ISSUED <span className="text-sig-text">{issuedAge}</span></span>
        )}
      </div>
    </div>
  );
}

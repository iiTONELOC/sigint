import { AgeStyle, formatTime, relativeAge } from "@/time";
import {
  CYCLONE_CATEGORY_METADATA,
  SaffirSimpson,
  type CycloneData,
} from "@shared/domain/cyclones";
import { CycloneWarningFlags } from "./CycloneWarningFlags";
import { EMPTY_TEXT, NO_VALUE, PARENTHETICAL } from "@shared/text";
import { BASIN_LABEL } from "@shared/cyclonesSeason";

enum CycloneKicker {
  MajorHurricane = "HURRICANE · MAJOR",
  Hurricane = "HURRICANE",
}

function PlacardTint() {
  return (
    <div className="absolute inset-0 bg-(--dossier-accent)/8 pointer-events-none" />
  );
}

function PlacardField({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-(length:--sig-text-xs) tracking-wider text-sig-dim">
        {label}
      </div>
      <div className="text-(length:--sig-text-md) text-sig-bright mt-0.5">
        {children}
      </div>
    </div>
  );
}

function PlacardFooterValue({ children }: { readonly children: React.ReactNode }) {
  return <span className="text-sig-text">{children}</span>;
}

/** Return the uppercase storm classification. */
function kicker(data: CycloneData): string {
  if (data.saffirSimpson !== SaffirSimpson.None) {
    return data.saffirSimpson >= SaffirSimpson.Cat3
      ? CycloneKicker.MajorHurricane
      : CycloneKicker.Hurricane;
  }
  return CYCLONE_CATEGORY_METADATA[data.classification].label
    .toUpperCase()
    .replace(PARENTHETICAL, EMPTY_TEXT);
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
  const badge = data.saffirSimpson !== SaffirSimpson.None ? String(data.saffirSimpson) : data.classification;
  const issuedAge = issued
    ? `${formatTime(issued)} · ${relativeAge(new Date(issued).getTime(), AgeStyle.Verbose)}`
    : null;

  if (compact) {
    return (
      <div className="relative flex items-center gap-3 border border-(--dossier-accent)/40 rounded-xl overflow-hidden bg-sig-panel px-3 py-2">
        <PlacardTint />
        <div className="absolute left-0 inset-y-0 w-1 bg-(--dossier-accent)" />
        <div className="relative flex flex-col items-center justify-center w-10 h-10 shrink-0 rounded-[10px] border-2 border-(--dossier-accent) text-(--dossier-accent)">
          <span className="text-(length:--sig-text-md) font-bold leading-none">{badge}</span>
          {data.saffirSimpson !== SaffirSimpson.None && (
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
            {data.stormId} · {BASIN_LABEL[data.basin]} · ADV {data.advisoryNumber || NO_VALUE}
          </div>
        </div>
        <CycloneWarningFlags maxWindKt={data.maxWindKt} isHurricane={data.saffirSimpson !== SaffirSimpson.None} />
      </div>
    );
  }

  return (
    <div className="relative border border-(--dossier-accent)/40 rounded-2xl overflow-hidden bg-sig-panel">
      <PlacardTint />
      <div className="relative h-1 bg-(--dossier-accent)" />
      <div className="relative px-4 pt-3 pb-3">
        <div className="absolute top-3 right-3 flex items-center gap-2">
          <CycloneWarningFlags maxWindKt={data.maxWindKt} isHurricane={data.saffirSimpson !== SaffirSimpson.None} />
          <div className="flex flex-col items-center justify-center w-14 h-14 rounded-[12px] border-2 border-(--dossier-accent) text-(--dossier-accent)">
            <span className="text-(length:--sig-text-title) font-bold leading-none">{badge}</span>
            {data.saffirSimpson !== SaffirSimpson.None && (
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
          <PlacardField label="STORM ID">
            <span className="font-mono">{data.stormId}</span>
          </PlacardField>
          <PlacardField label="BASIN">{BASIN_LABEL[data.basin]}</PlacardField>
        </div>
      </div>
      <div className="relative flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-(--dossier-accent)/20 bg-sig-bg/40 px-4 py-2 text-(length:--sig-text-xs) text-sig-dim">
        <span className="shrink-0">
          ADVISORY <PlacardFooterValue>{data.advisoryNumber || NO_VALUE}</PlacardFooterValue>
        </span>
        {issuedAge && (
          <span className="min-w-0">
            ISSUED <PlacardFooterValue>{issuedAge}</PlacardFooterValue>
          </span>
        )}
      </div>
    </div>
  );
}

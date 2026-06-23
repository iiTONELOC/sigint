import { Zap, ArrowRight } from "lucide-react";
import type { CSSProperties } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { relativeAge } from "@/lib/format/timeFormat";
import { DossierToolbar, Section, LinkRow, useDossierFocus } from "@/panes/dossier/DossierAtoms";
import type { EventData } from "../types";

// Events keep their own magenta identity — distinct from fire (orange),
// weather (violet) and cyclones (red).
const ACCENT = "#d6448f";

function toneLabel(tone: number): string {
  if (tone <= -15) return "very negative";
  if (tone <= -5) return "negative";
  if (tone <= -1) return "slightly negative";
  if (tone <= 1) return "neutral";
  if (tone <= 5) return "slightly positive";
  return "positive";
}

function goldsteinLabel(gs: number): string {
  if (gs <= -5) return "major conflict";
  if (gs < 0) return "conflict";
  if (gs === 0) return "neutral";
  if (gs <= 5) return "cooperation";
  return "major cooperation";
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="leading-none">
      <div className="text-(length:--sig-text-lg) text-sig-bright font-bold font-mono">{value}</div>
      <div className="text-(length:--sig-text-xs) tracking-wider text-sig-dim mt-1">{label}</div>
    </div>
  );
}

type Props = {
  readonly item: DataPoint;
  readonly isolateMode: null | "solo" | "focus";
  readonly onLocate: () => void;
  readonly onFocus: () => void;
  readonly onSolo: () => void;
  readonly onClose: () => void;
};

export function EventDossier({
  item,
  isolateMode,
  onLocate,
  onFocus,
  onSolo,
  onClose,
}: Props) {
  const d = (item.data as EventData) ?? {};
  const {
    headline,
    category,
    tone,
    goldstein,
    mentions,
    actor1,
    actor2,
    source,
    sourceCountry,
    locationName,
    url,
    imageUrl,
  } = d;
  const age = item.timestamp ? relativeAge(new Date(item.timestamp).getTime(), "verbose") : null;
  const closeBtnRef = useDossierFocus(item.id);

  return (
    <div
      className="h-full min-w-0 flex flex-col"
      style={{ "--dossier-accent": ACCENT } as CSSProperties}
    >
      <DossierToolbar
        icon={Zap}
        title={headline || "Intel event"}
        subtitle="GDELT EVENT"
        isolateMode={isolateMode}
        onLocate={onLocate}
        onFocus={onFocus}
        onSolo={onSolo}
        onClose={onClose}
        closeButtonRef={closeBtnRef}
      />
      <div className="@container/event flex-1 min-w-0 overflow-y-auto sigint-scroll p-3">
        <div className="w-full max-w-200 mx-auto flex flex-col gap-3">
          <div className="relative rounded-2xl overflow-hidden border border-(--dossier-accent)/40 bg-sig-panel">
            <div className="absolute inset-0 bg-(--dossier-accent)/6 pointer-events-none" />
            <div className="relative h-1 bg-(--dossier-accent)" />
            <div className="relative px-4 pt-3 pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-(length:--sig-text-xs) tracking-widest text-(--dossier-accent) font-semibold">
                    INTEL EVENT
                  </div>
                  <div className="text-(length:--sig-text-md) text-sig-bright font-bold tracking-wide leading-snug mt-1">
                    {headline || "Intel event"}
                  </div>
                  {(actor1 || actor2) && (
                    <div className="flex items-center gap-1.5 flex-wrap text-(length:--sig-text-sm) text-sig-text mt-2">
                      <span className="font-semibold">{actor1 || "Unknown"}</span>
                      {actor2 && <ArrowRight className="w-3.5 h-3.5 text-(--dossier-accent) shrink-0" aria-hidden="true" />}
                      {actor2 && <span className="font-semibold">{actor2}</span>}
                    </div>
                  )}
                </div>
                {category && (
                  <span className="shrink-0 text-(length:--sig-text-xs) font-bold tracking-wider px-2 py-1 rounded-[10px] border-2 border-(--dossier-accent) text-(--dossier-accent) whitespace-nowrap uppercase">
                    {category}
                  </span>
                )}
              </div>

              <div className="flex items-end gap-5 flex-wrap mt-3">
                {goldstein != null && (
                  <Metric label={`IMPACT · ${goldsteinLabel(goldstein)}`} value={goldstein.toFixed(1)} />
                )}
                {tone != null && <Metric label={`TONE · ${toneLabel(tone)}`} value={tone.toFixed(1)} />}
                {mentions != null && mentions > 0 && <Metric label="MENTIONS" value={String(mentions)} />}
              </div>
            </div>

            <div className="relative flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-(--dossier-accent)/20 bg-sig-bg/40 px-4 py-2 text-(length:--sig-text-xs) text-sig-dim">
              <span className="shrink-0 min-w-0 truncate">
                SOURCE <span className="text-sig-text">{source || "—"}{sourceCountry ? ` · ${sourceCountry}` : ""}</span>
              </span>
              {age && <span className="shrink-0">{age}</span>}
            </div>
          </div>

          {imageUrl && (
            <img
              src={imageUrl}
              alt=""
              className="w-full max-h-56 object-cover rounded-[10px] border border-sig-border"
              loading="lazy"
            />
          )}

          {locationName && (
            <section className="min-w-0 bg-sig-panel border border-sig-border rounded-[10px] p-3">
              <Section title="LOCATION">
                <div className="text-(length:--sig-text-sm) text-sig-text">{locationName}</div>
              </Section>
            </section>
          )}

          {url && (
            <section className="min-w-0 bg-sig-panel border border-sig-border rounded-[10px] p-3">
              <Section title="SOURCE">
                <LinkRow label="Read article" href={url} />
              </Section>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

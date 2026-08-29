import { Zap, ArrowRight } from "lucide-react";
import type { FeatureDossierProps } from "@/features/base/presentation";
import { Domain } from "@shared/domain/identity";
import { AgeStyle, relativeAge } from "@/time";
import {
  DossierIdentityCard,
  DossierLinkRow,
  DossierMetric,
  DossierMetricValueClass,
  DossierSection,
  DossierSectionCard,
  DossierToolbar,
  useDossierFocus,
} from "@/dossier";
import { NO_VALUE } from "@shared/text";
import { EventCopy, EventFieldLabel } from "../formatters/copy";
import { eventImpactLabel, eventToneLabel } from "../utils/tone";

enum EventDossierClassName {
  Semibold = "font-semibold",
}

type Props = FeatureDossierProps<Domain.Events>;

export function EventDossier({
  item,
  isolateMode,
  onLocate,
  onFocus,
  onSolo,
  onClose,
}: Props) {
  const d = item.data;
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
  } = d;
  const age = item.timestamp
    ? relativeAge(new Date(item.timestamp).getTime(), AgeStyle.Verbose)
    : null;
  const closeBtnRef = useDossierFocus(item.id);

  return (
    <div className="h-full min-w-0 flex flex-col">
      <DossierToolbar
        icon={Zap}
        title={headline || EventCopy.DefaultTitle}
        subtitle={EventCopy.ToolbarKind}
        isolateMode={isolateMode}
        onLocate={onLocate}
        onFocus={onFocus}
        onSolo={onSolo}
        onClose={onClose}
        closeButtonRef={closeBtnRef}
      />
      <div className="@container/event flex-1 min-w-0 overflow-y-auto sigint-scroll p-3">
        <div className="w-full max-w-200 mx-auto flex flex-col gap-3">
          <DossierIdentityCard
            age={age}
            source={
              <>
                {source || NO_VALUE}
                {sourceCountry ? ` · ${sourceCountry}` : ""}
              </>
            }
            truncateSource
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className={`text-(length:--sig-text-xs) tracking-widest text-(--dossier-accent) ${EventDossierClassName.Semibold}`}>
                  {EventCopy.Kind}
                </div>
                <div className="text-(length:--sig-text-md) text-sig-bright font-bold tracking-wide leading-snug mt-1">
                  {headline || EventCopy.DefaultTitle}
                </div>
                {(actor1 || actor2) && (
                  <div className="flex items-center gap-1.5 flex-wrap text-(length:--sig-text-sm) text-sig-text mt-2">
                    <span className={EventDossierClassName.Semibold}>
                      {actor1 || EventCopy.UnknownActor}
                    </span>
                    {actor2 && <ArrowRight className="w-3.5 h-3.5 text-(--dossier-accent) shrink-0" aria-hidden="true" />}
                    {actor2 && (
                      <span className={EventDossierClassName.Semibold}>
                        {actor2}
                      </span>
                    )}
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
                <DossierMetric
                  label={`${EventFieldLabel.Impact.toUpperCase()} · ${eventImpactLabel(goldstein)}`}
                  value={goldstein.toFixed(1)}
                  valueClass={DossierMetricValueClass.Large}
                />
              )}
              {tone != null && (
                <DossierMetric
                  label={`${EventFieldLabel.Tone.toUpperCase()} · ${eventToneLabel(tone)}`}
                  value={tone.toFixed(1)}
                  valueClass={DossierMetricValueClass.Large}
                />
              )}
              {mentions != null && mentions > 0 && (
                <DossierMetric
                  label={EventFieldLabel.Mentions.toUpperCase()}
                  value={String(mentions)}
                  valueClass={DossierMetricValueClass.Large}
                />
              )}
            </div>
          </DossierIdentityCard>

          {locationName && (
            <DossierSectionCard>
              <DossierSection title={EventFieldLabel.Location.toUpperCase()}>
                <div className="text-(length:--sig-text-sm) text-sig-text">
                  {locationName}
                </div>
              </DossierSection>
            </DossierSectionCard>
          )}

          {url && (
            <DossierSectionCard>
              <DossierSection title={EventFieldLabel.Source.toUpperCase()}>
                <DossierLinkRow label={EventCopy.ReadArticle} href={url} />
              </DossierSection>
            </DossierSectionCard>
          )}
        </div>
      </div>
    </div>
  );
}

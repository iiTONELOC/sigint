import {
  DossierRow,
  DossierSection,
  DossierSectionCard,
  DossierToolbar,
  useDossierFocus,
} from "@/dossier";
import { CloudAlert } from "lucide-react";
import type { CSSProperties } from "react";
import type { FeatureDossierProps } from "@/features/base/presentation";
import { Domain } from "@shared/domain/identity";
import { weatherSeverityInk } from "../render";
import { unwrapNwsText, weatherAreas } from "../text";
import { WeatherPlacard } from "./WeatherPlacard";
import { WeatherTiming } from "./WeatherTiming";
import { WeatherCopy } from "../formatters/presentation";

type Props = FeatureDossierProps<Domain.Weather>;

const WIDE_CARD_CLASS_NAME = "@min-[34rem]/wx:col-span-2";

export function WeatherDossier({
  item,
  isolateMode,
  onLocate,
  onFocus,
  onSolo,
  onClose,
}: Props) {
  const closeBtnRef = useDossierFocus(item.id);
  const data = item.data;
  const areas = weatherAreas(data.areaDesc);
  const now = Date.now();

  return (
    <div
      className="h-full min-w-0 flex flex-col"
      style={
        {
          "--dossier-accent": weatherSeverityInk(data.severity),
        } as CSSProperties
      }
    >
      <DossierToolbar
        icon={CloudAlert}
        title={data.event || WeatherCopy.Alert}
        subtitle={WeatherCopy.Alert.toUpperCase()}
        isolateMode={isolateMode}
        onLocate={onLocate}
        onFocus={onFocus}
        onSolo={onSolo}
        onClose={onClose}
        closeButtonRef={closeBtnRef}
      />
      <div className="@container/wx flex-1 min-w-0 overflow-y-auto sigint-scroll p-3">
        <div className="w-full max-w-225 mx-auto">
          <div className="grid w-full min-w-0 grid-cols-1 @min-[34rem]/wx:grid-cols-2 gap-3 items-start *:min-w-0">
            <div className={WIDE_CARD_CLASS_NAME}>
              <WeatherPlacard
                event={data.event}
                severity={data.severity}
                urgency={data.urgency}
                certainty={data.certainty}
                response={data.response}
                headline={data.headline}
                senderName={data.senderName}
                areaDesc={data.areaDesc}
                timestamp={item.timestamp}
              />
            </div>

            <DossierSectionCard>
              <DossierSection title="IN EFFECT">
                <WeatherTiming
                  onset={data.onset}
                  expires={data.expires}
                  now={now}
                />
              </DossierSection>
            </DossierSectionCard>

            {data.instruction && (
              <section className="min-w-0 rounded-[10px] border border-(--dossier-accent)/40 bg-(--dossier-accent)/8 p-3">
                <div className="text-(length:--sig-text-xs) tracking-widest text-(--dossier-accent) font-semibold mb-1.5">
                  PROTECTIVE ACTION
                </div>
                <div className="text-(length:--sig-text-sm) text-sig-bright leading-relaxed whitespace-pre-line">
                  {unwrapNwsText(data.instruction)}
                </div>
              </section>
            )}

            {areas.length > 0 && (
              <div className={WIDE_CARD_CLASS_NAME}>
                <DossierSectionCard>
                  <DossierSection title={`AFFECTED AREA · ${areas.length}`}>
                    <div className="flex flex-wrap gap-1.5">
                      {areas.map((area) => (
                        <span
                          key={area}
                          className="text-(length:--sig-text-xs) text-sig-text bg-sig-bg/60 border border-sig-border rounded px-2 py-0.5"
                        >
                          {area}
                        </span>
                      ))}
                    </div>
                    {data.category && (
                      <div className="mt-2">
                        <DossierRow label="CATEGORY" value={data.category} />
                      </div>
                    )}
                  </DossierSection>
                </DossierSectionCard>
              </div>
            )}

            {data.description && (
              <div className={WIDE_CARD_CLASS_NAME}>
                <DossierSectionCard>
                  <DossierSection title="DETAILS">
                    <div className="text-(length:--sig-text-sm) text-sig-text/80 leading-relaxed max-h-72 overflow-y-auto sigint-scroll whitespace-pre-line">
                      {unwrapNwsText(data.description)}
                    </div>
                  </DossierSection>
                </DossierSectionCard>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

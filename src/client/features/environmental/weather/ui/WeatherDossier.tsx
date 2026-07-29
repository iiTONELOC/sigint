import type { SelectedIsolateMode } from "@/workers/render/protocol";
import { CloudAlert } from "lucide-react";
import type { CSSProperties } from "react";
import {
  DossierToolbar,
  Section,
  Row,
  useDossierFocus,
} from "@/panes/dossier/DossierAtoms";
import type { WeatherPoint } from "../types";
import { weatherSeverityInk } from "../severity";
import { unwrapNwsText, weatherAreas } from "../text";
import { WeatherPlacard } from "./WeatherPlacard";
import { WeatherTiming } from "./WeatherTiming";

type Props = {
  readonly item: WeatherPoint;
  readonly isolateMode: SelectedIsolateMode;
  readonly onLocate: () => void;
  readonly onFocus: () => void;
  readonly onSolo: () => void;
  readonly onClose: () => void;
};

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
        title={data.event || "Weather Alert"}
        subtitle="WEATHER ALERT"
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
            <div className="@min-[34rem]/wx:col-span-2">
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

            <section className="min-w-0 bg-sig-panel border border-sig-border rounded-[10px] p-3">
              <Section title="IN EFFECT">
                <WeatherTiming
                  onset={data.onset}
                  expires={data.expires}
                  now={now}
                />
              </Section>
            </section>

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
              <section className="min-w-0 bg-sig-panel border border-sig-border rounded-[10px] p-3 @min-[34rem]/wx:col-span-2">
                <Section title={`AFFECTED AREA · ${areas.length}`}>
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
                      <Row label="CATEGORY" value={data.category} />
                    </div>
                  )}
                </Section>
              </section>
            )}

            {data.description && (
              <section className="min-w-0 bg-sig-panel border border-sig-border rounded-[10px] p-3 @min-[34rem]/wx:col-span-2">
                <Section title="DETAILS">
                  <div className="text-(length:--sig-text-sm) text-sig-text/80 leading-relaxed max-h-72 overflow-y-auto sigint-scroll whitespace-pre-line">
                    {unwrapNwsText(data.description)}
                  </div>
                </Section>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

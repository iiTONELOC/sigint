import { CloudAlert } from "lucide-react";
import type { CSSProperties } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { DossierToolbar, Section, Row, useDossierFocus } from "@/panes/dossier/DossierAtoms";
import { severityMeta } from "../severity";
import { unwrapNwsText } from "../text";
import { WeatherPlacard } from "./WeatherPlacard";
import { WeatherTiming } from "./WeatherTiming";

type Props = {
  readonly item: DataPoint;
  readonly isolateMode: null | "solo" | "focus";
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
  const d = (item.data as Record<string, unknown>) ?? {};
  const str = (k: string): string | undefined => {
    const v = d[k];
    return typeof v === "string" ? v : undefined;
  };
  const event = str("event");
  const severity = str("severity");
  const instruction = str("instruction");
  const description = str("description");
  const areaDesc = str("areaDesc");
  const category = str("category");
  const closeBtnRef = useDossierFocus(item.id);
  const now = Date.now();

  const areas = areaDesc ? areaDesc.split(";").map((a) => a.trim()).filter(Boolean) : [];

  return (
    <div
      className="h-full min-w-0 flex flex-col"
      style={{ "--dossier-accent": severityMeta(severity).ink } as CSSProperties}
    >
      <DossierToolbar
        icon={CloudAlert}
        title={event || "Weather Alert"}
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
                event={event}
                severity={severity}
                urgency={str("urgency")}
                certainty={str("certainty")}
                response={str("response")}
                headline={str("headline")}
                senderName={str("senderName")}
                areaDesc={areaDesc}
                timestamp={item.timestamp}
              />
            </div>

            <section className="min-w-0 bg-sig-panel border border-sig-border rounded-[10px] p-3">
              <Section title="IN EFFECT">
                <WeatherTiming onset={str("onset")} expires={str("expires")} now={now} />
              </Section>
            </section>

            {instruction && (
              <section className="min-w-0 rounded-[10px] border border-(--dossier-accent)/40 bg-(--dossier-accent)/8 p-3">
                <div className="text-(length:--sig-text-xs) tracking-widest text-(--dossier-accent) font-semibold mb-1.5">
                  PROTECTIVE ACTION
                </div>
                <div className="text-(length:--sig-text-sm) text-sig-bright leading-relaxed whitespace-pre-line">
                  {unwrapNwsText(instruction)}
                </div>
              </section>
            )}

            {areas.length > 0 && (
              <section className="min-w-0 bg-sig-panel border border-sig-border rounded-[10px] p-3 @min-[34rem]/wx:col-span-2">
                <Section title={`AFFECTED AREA · ${areas.length}`}>
                  <div className="flex flex-wrap gap-1.5">
                    {areas.map((a, i) => (
                      <span
                        key={`${a}-${i}`}
                        className="text-(length:--sig-text-xs) text-sig-text bg-sig-bg/60 border border-sig-border rounded px-2 py-0.5"
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                  {category && <div className="mt-2"><Row label="CATEGORY" value={category} /></div>}
                </Section>
              </section>
            )}

            {description && (
              <section className="min-w-0 bg-sig-panel border border-sig-border rounded-[10px] p-3 @min-[34rem]/wx:col-span-2">
                <Section title="DETAILS">
                  <div className="text-(length:--sig-text-sm) text-sig-text/80 leading-relaxed max-h-72 overflow-y-auto sigint-scroll whitespace-pre-line">
                    {unwrapNwsText(description)}
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

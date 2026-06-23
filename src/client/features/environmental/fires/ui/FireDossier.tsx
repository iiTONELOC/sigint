import { Flame } from "lucide-react";
import type { CSSProperties } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { DossierToolbar, Section, LinkRow, useDossierFocus } from "@/panes/dossier/DossierAtoms";
import type { FireData } from "../types";
import { frpInk } from "../intensity";
import { FireIdentityCard } from "./FireIdentityCard";
import { ThermalSignature } from "./ThermalSignature";
import { FrpScale } from "./FrpScale";
import { DetectionFootprint } from "./DetectionFootprint";

type Props = {
  readonly item: DataPoint;
  readonly isolateMode: null | "solo" | "focus";
  readonly onLocate: () => void;
  readonly onFocus: () => void;
  readonly onSolo: () => void;
  readonly onClose: () => void;
};

export function FireDossier({
  item,
  isolateMode,
  onLocate,
  onFocus,
  onSolo,
  onClose,
}: Props) {
  const d = (item.data as FireData) ?? {};
  const frp = d.frp ?? 0;
  const fireK = d.brightness;
  const bgK = d.brightT31;
  const hasThermal = fireK != null && fireK > 0 && bgK != null && bgK > 0;
  const { scan, track } = d;
  const closeBtnRef = useDossierFocus(item.id);
  const title = frp > 0 ? `Fire hotspot — ${frp.toFixed(1)} MW` : "Fire hotspot";

  return (
    <div
      className="h-full min-w-0 flex flex-col"
      style={{ "--dossier-accent": frpInk(frp) } as CSSProperties}
    >
      <DossierToolbar
        icon={Flame}
        title={title}
        subtitle="ACTIVE FIRE"
        isolateMode={isolateMode}
        onLocate={onLocate}
        onFocus={onFocus}
        onSolo={onSolo}
        onClose={onClose}
        closeButtonRef={closeBtnRef}
      />
      <div className="@container/fire flex-1 min-w-0 overflow-y-auto sigint-scroll p-3">
        <div className="w-full max-w-200 mx-auto">
          <div className="grid w-full min-w-0 grid-cols-1 @min-[40rem]/fire:grid-cols-2 gap-3 items-start *:min-w-0">
            <div className="@min-[40rem]/fire:col-span-2">
              <FireIdentityCard
                frp={frp}
                confidence={d.confidence}
                fireK={fireK}
                bgK={bgK}
                lat={item.lat}
                lon={item.lon}
                scan={d.scan}
                track={d.track}
                daynight={d.daynight}
                satellite={d.satellite}
                instrument={d.instrument}
                timestamp={item.timestamp}
              />
            </div>

            {hasThermal && (
              <section className="min-w-0 bg-sig-panel border border-sig-border rounded-[10px] p-3">
                <Section title="THERMAL SIGNATURE">
                  <ThermalSignature fireK={fireK} bgK={bgK} frp={frp} />
                </Section>
              </section>
            )}

            <section className="min-w-0 bg-sig-panel border border-sig-border rounded-[10px] p-3">
              <Section title="INTENSITY">
                <FrpScale frp={frp} />
              </Section>
            </section>

            {scan != null && track != null && (
              <section className="min-w-0 bg-sig-panel border border-sig-border rounded-[10px] p-3">
                <Section title="DETECTION FOOTPRINT">
                  <DetectionFootprint scan={scan} track={track} />
                </Section>
              </section>
            )}

            <section className="min-w-0 bg-sig-panel border border-sig-border rounded-[10px] p-3">
              <Section title="INTEL LINKS">
                <LinkRow
                  label="NASA FIRMS Map"
                  href={`https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@${item.lon},${item.lat},10z`}
                />
                <LinkRow
                  label="Google Maps (Satellite)"
                  href={`https://www.google.com/maps/@${item.lat},${item.lon},14z/data=!3m1!1e1`}
                />
              </Section>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

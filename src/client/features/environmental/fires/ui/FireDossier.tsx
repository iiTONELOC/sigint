import type { SelectedIsolateMode } from "@/workers/render/protocol";
import { Flame } from "lucide-react";
import {
  DossierMetric,
  DossierMetricValueClass,
  DossierSectionCard,
} from "@/dossier";
import type { DataPoint } from "@/features/base/dataPoints";
import { DossierToolbar, Section, LinkRow, useDossierFocus } from "@/panes/dossier/DossierAtoms";
import type { FireData } from "../types";
import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
import { frpBand } from "../intensity";
import { FireIdentityCard } from "./FireIdentityCard";
import { ThermalSignature } from "./ThermalSignature";
import { FrpScale } from "./FrpScale";
import { DetectionFootprint } from "./DetectionFootprint";
import { FireCopy, formatFirePower } from "../formatters";

type Props = {
  readonly item: DataPoint;
  readonly isolateMode: SelectedIsolateMode;
  readonly onLocate: () => void;
  readonly onFocus: () => void;
  readonly onSolo: () => void;
  readonly onClose: () => void;
};

enum FireComplexValue {
  MinimumClusterDetections = 2,
}

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
  const band = frpBand(frp);
  const fireK = d.brightness;
  const bgK = d.brightT31;
  const hasThermal = fireK != null && fireK > 0 && bgK != null && bgK > 0;
  const { scan, track } = d;
  const closeBtnRef = useDossierFocus(item.id);
  const title = frp > 0
    ? `${FireCopy.Hotspot}: ${formatFirePower(frp)}`
    : FireCopy.Hotspot;

  return (
    <div className={`${band.className} h-full min-w-0 flex flex-col`}>
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
                lat={recordLatitude(item)}
                lon={recordLongitude(item)}
                scan={d.scan}
                track={d.track}
                daynight={d.daynight}
                satellite={d.satellite}
                instrument={d.instrument}
                timestamp={item.timestamp}
              />
            </div>

            {hasThermal && (
              <DossierSectionCard>
                <Section title="THERMAL SIGNATURE">
                  <ThermalSignature fireK={fireK} bgK={bgK} frp={frp} />
                </Section>
              </DossierSectionCard>
            )}

            <DossierSectionCard>
              <Section title="INTENSITY">
                <FrpScale frp={frp} />
              </Section>
            </DossierSectionCard>

            <DossierSectionCard>
              <Section title="FIRE COMPLEX">
                {(d.complexSize ?? 0) >=
                FireComplexValue.MinimumClusterDetections ? (
                  <div className="flex items-end gap-6 flex-wrap">
                    <DossierMetric
                      label="DETECTIONS"
                      value={d.complexSize}
                      valueClass={DossierMetricValueClass.Large}
                    />
                    <DossierMetric
                      label="TOTAL FRP"
                      value={`${d.complexFrp} MW`}
                      valueClass={DossierMetricValueClass.Large}
                    />
                    <div className="text-(length:--sig-text-xs) text-sig-dim self-center min-w-0">
                      connected cluster (~2 km) · detection extent, not burn area
                    </div>
                  </div>
                ) : (
                  <div className="text-(length:--sig-text-xs) text-sig-dim">isolated detection</div>
                )}
              </Section>
            </DossierSectionCard>

            {scan != null && track != null && (
              <DossierSectionCard>
                <Section title="DETECTION FOOTPRINT">
                  <DetectionFootprint scan={scan} track={track} />
                </Section>
              </DossierSectionCard>
            )}

            <DossierSectionCard>
              <Section title="INTEL LINKS">
                <LinkRow
                  label="NASA FIRMS Map"
                  href={`https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@${recordLongitude(item)},${recordLatitude(item)},10z`}
                />
                <LinkRow
                  label="Google Maps (Satellite)"
                  href={`https://www.google.com/maps/@${recordLatitude(item)},${recordLongitude(item)},14z/data=!3m1!1e1`}
                />
              </Section>
            </DossierSectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}

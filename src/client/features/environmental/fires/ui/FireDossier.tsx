import { Flame } from "lucide-react";
import type { FeatureDossierProps } from "@/features/base/presentation";
import { Domain } from "@shared/domain/identity";
import {
  DossierBandScale,
  DossierLinkRow,
  DossierMetric,
  DossierMetricValueClass,
  DossierSection,
  DossierSectionCard,
  DossierToolbar,
  useDossierFocus,
} from "@/dossier";
import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
import { frpBand, frpScale } from "../intensity";
import { FireIdentityCard } from "./FireIdentityCard";
import { ThermalSignature } from "./ThermalSignature";
import { DetectionFootprint } from "./DetectionFootprint";
import { FireCopy, formatFirePower } from "../formatters/presentation";

type Props = FeatureDossierProps<Domain.Fires>;

const MINIMUM_FIRE_COMPLEX_DETECTIONS = 2;

export function FireDossier({
  item,
  isolateMode,
  onLocate,
  onFocus,
  onSolo,
  onClose,
}: Props) {
  const d = item.data;
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
                <DossierSection title="THERMAL SIGNATURE">
                  <ThermalSignature fireK={fireK} bgK={bgK} frp={frp} />
                </DossierSection>
              </DossierSectionCard>
            )}

            <DossierSectionCard>
              <DossierSection title="INTENSITY">
                <DossierBandScale
                  activeBand={band}
                  bands={frpScale()}
                  detail="fire radiative power"
                  tickLabel={(candidate) => candidate.min}
                  value={formatFirePower(frp)}
                />
              </DossierSection>
            </DossierSectionCard>

            <DossierSectionCard>
              <DossierSection title="FIRE COMPLEX">
                {(d.complexSize ?? 0) >= MINIMUM_FIRE_COMPLEX_DETECTIONS ? (
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
              </DossierSection>
            </DossierSectionCard>

            {scan != null && track != null && (
              <DossierSectionCard>
                <DossierSection title="DETECTION FOOTPRINT">
                  <DetectionFootprint scan={scan} track={track} />
                </DossierSection>
              </DossierSectionCard>
            )}

            <DossierSectionCard>
              <DossierSection title="INTEL LINKS">
                <DossierLinkRow
                  label="NASA FIRMS Map"
                  href={`https://firms.modaps.eosdis.nasa.gov/map/#d:24hrs;@${recordLongitude(item)},${recordLatitude(item)},10z`}
                />
                <DossierLinkRow
                  label="Google Maps (Satellite)"
                  href={`https://www.google.com/maps/@${recordLatitude(item)},${recordLongitude(item)},14z/data=!3m1!1e1`}
                />
              </DossierSection>
            </DossierSectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}

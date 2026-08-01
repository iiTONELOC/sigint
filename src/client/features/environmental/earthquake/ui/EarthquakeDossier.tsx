import type { SelectedIsolateMode } from "@/workers/render/protocol";
import { Activity } from "lucide-react";
import { DossierSectionCard } from "@/dossier";
import type { DataPoint } from "@/features/base/dataPoints";
import { DossierToolbar, Section, LinkRow, useDossierFocus } from "@/panes/dossier/DossierAtoms";
import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
import { estimateMmi, mmiBand } from "../intensity";
import type { EarthquakeData } from "../types";
import { useTsunamiAlerts } from "../hooks/useTsunamiAlerts";
import { QuakeIdentityCard } from "./QuakeIdentityCard";
import { MmiColumn } from "./MmiColumn";
import { Seismogram } from "./Seismogram";
import { DepthProfile } from "./DepthProfile";
import { TsunamiPlacard } from "./TsunamiPlacard";
import { TsunamiPhysics } from "./TsunamiPhysics";

type Props = {
  readonly item: DataPoint;
  readonly isolateMode: SelectedIsolateMode;
  readonly onLocate: () => void;
  readonly onFocus: () => void;
  readonly onSolo: () => void;
  readonly onClose: () => void;
};

export function EarthquakeDossier({
  item,
  isolateMode,
  onLocate,
  onFocus,
  onSolo,
  onClose,
}: Props) {
  const d = item.data as EarthquakeData;
  const magnitude = d.magnitude ?? 0;
  const { depth, magType, felt, significance, status } = d;
  const place = d.location;
  const tsunami = d.tsunami === true;
  const { url } = d;
  const mmi = estimateMmi(magnitude, depth);
  const band = mmiBand(mmi);
  const tsunamiAlerts = useTsunamiAlerts();
  const closeBtnRef = useDossierFocus(item.id);

  return (
    <div className={`${band.className} h-full min-w-0 flex flex-col`}>
      <DossierToolbar
        icon={Activity}
        title={place || "Seismic event"}
        subtitle="SEISMIC EVENT"
        isolateMode={isolateMode}
        onLocate={onLocate}
        onFocus={onFocus}
        onSolo={onSolo}
        onClose={onClose}
        closeButtonRef={closeBtnRef}
      />
      <div className="@container/quake flex-1 min-w-0 overflow-y-auto sigint-scroll p-3">
        <div className="w-full max-w-200 mx-auto flex flex-col gap-3">
          <QuakeIdentityCard
            magnitude={magnitude}
            magType={magType}
            mmi={mmi}
            depthKm={depth}
            location={place}
            lat={recordLatitude(item)}
            lon={recordLongitude(item)}
            felt={felt}
            significance={significance}
            timestamp={item.timestamp}
            status={status}
          />

          {tsunami &&
            (tsunamiAlerts.length > 0 ? (
              tsunamiAlerts.map((a) => <TsunamiPlacard key={a.id} alert={a} />)
            ) : (
              <div className="flex items-center gap-2 rounded-[10px] border border-(--dossier-accent)/40 bg-(--dossier-accent)/8 px-3 py-2 text-(length:--sig-text-sm) text-(--dossier-accent)">
                <span aria-hidden="true">🌊</span>
                <span className="font-semibold tracking-wide">TSUNAMI-SOURCE REGION</span>
                <span className="text-sig-dim text-(length:--sig-text-xs)">monitored by NOAA · no active alert</span>
              </div>
            ))}

          <DossierSectionCard>
            <Section title="SEISMOGRAM">
              <Seismogram lat={recordLatitude(item)} lon={recordLongitude(item)} originTimeIso={item.timestamp} mmi={mmi} />
            </Section>
          </DossierSectionCard>

          <DossierSectionCard>
            <Section title="SHAKING INTENSITY">
              <MmiColumn mmi={mmi} />
            </Section>
          </DossierSectionCard>

          <DossierSectionCard>
            <Section title="HYPOCENTER">
              {depth == null ? (
                <div className="text-(length:--sig-text-xs) text-sig-dim">depth unavailable</div>
              ) : (
                <DepthProfile depthKm={depth} mmi={mmi} />
              )}
            </Section>
          </DossierSectionCard>

          {tsunami && (
            <DossierSectionCard>
              <Section title="WAVE TRAVEL">
                <TsunamiPhysics />
              </Section>
            </DossierSectionCard>
          )}

          {url && (
            <DossierSectionCard>
              <Section title="INTEL LINKS">
                <LinkRow label="USGS Event Detail" href={url} />
                <LinkRow label="USGS ShakeMap" href={`${url}/shakemap`} />
              </Section>
            </DossierSectionCard>
          )}
        </div>
      </div>
    </div>
  );
}

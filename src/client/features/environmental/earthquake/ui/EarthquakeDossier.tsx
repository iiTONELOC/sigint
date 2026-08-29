import { useEffect, useState } from "react";
import type {
  EarthquakeData,
  TsunamiAlert,
  WaveformState,
} from "@shared/domain/earthquakes";
import {
  WaveformStatus,
  WaveformUnavailableReason,
  waveformUnavailable,
} from "@shared/domain/earthquakes";
import { Activity } from "lucide-react";
import {
  DossierBandScale,
  DossierLinkRow,
  DossierSection,
  DossierSectionCard,
  DossierToolbar,
  useDossierFocus,
} from "@/dossier";
import type { FeatureDossierProps } from "@/features/base/presentation";
import { Domain } from "@shared/domain/identity";
import { getDataWorkerClient } from "@/lib/cache/dataWorkerClient";
import { DomEvent, DomVisibilityState } from "@/runtime";
import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
import { estimateMmi, mmiBand, mmiScale } from "../intensity";
import { QuakeIdentityCard } from "./QuakeIdentityCard";
import { Seismogram } from "./Seismogram";
import { DepthProfile } from "./DepthProfile";
import { TsunamiPlacard } from "./TsunamiPlacard";
import { TsunamiPhysics } from "./TsunamiPhysics";

const TSUNAMI_REFRESH_INTERVAL_MS = 5 * 60_000;

type Props = FeatureDossierProps<Domain.Quakes>;

export function EarthquakeDossier({
  item,
  isolateMode,
  onLocate,
  onFocus,
  onSolo,
  onClose,
}: Props) {
  const d: EarthquakeData = item.data;
  const latitude = recordLatitude(item);
  const longitude = recordLongitude(item);
  const originTimeIso = item.timestamp;
  const closeBtnRef = useDossierFocus(item.id);
  const [waveformState, setWaveformState] = useState<WaveformState>({
    status: WaveformStatus.Loading,
  });
  const [tsunamiAlerts, setTsunamiAlerts] = useState<TsunamiAlert[]>([]);

  useEffect(() => {
    if (!originTimeIso) {
      setWaveformState(waveformUnavailable(WaveformUnavailableReason.EventTime));
      return;
    }
    const client = getDataWorkerClient();
    if (!client) {
      setWaveformState(
        waveformUnavailable(WaveformUnavailableReason.StationService),
      );
      return;
    }
    let cancelled = false;
    setWaveformState({ status: WaveformStatus.Loading });
    void client
      .getEarthquakeWaveform({ latitude, longitude, originTimeIso })
      .catch(() =>
        waveformUnavailable(WaveformUnavailableReason.StationService),
      )
      .then((result) => {
        if (!cancelled) setWaveformState(result);
      });
    return () => {
      cancelled = true;
      client.cancelEarthquakeWaveform();
    };
  }, [latitude, longitude, originTimeIso]);

  useEffect(() => {
    let mounted = true;
    const load = async (): Promise<void> => {
      const client = getDataWorkerClient();
      const alerts = client
        ? await client.getTsunamiAlerts().catch(() => [])
        : [];
      if (mounted) setTsunamiAlerts([...alerts]);
    };
    void load();
    const interval = setInterval(() => {
      void load();
    }, TSUNAMI_REFRESH_INTERVAL_MS);
    const onVisible = (): void => {
      if (document.visibilityState === DomVisibilityState.Visible) void load();
    };
    document.addEventListener(DomEvent.VisibilityChange, onVisible);
    return () => {
      mounted = false;
      clearInterval(interval);
      document.removeEventListener(DomEvent.VisibilityChange, onVisible);
    };
  }, []);

  const magnitude = d.magnitude ?? 0;
  const { depth, magType, felt, significance, status, url } = d;
  const place = d.location;
  const tsunami = d.tsunami === true;
  const band = mmiBand(estimateMmi(magnitude, depth));

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
            mmiRoman={band.roman}
            mmiLabel={band.label}
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
            <DossierSection title="SEISMOGRAM">
              <Seismogram
                bandClassName={band.className}
                state={waveformState}
              />
            </DossierSection>
          </DossierSectionCard>

          <DossierSectionCard>
            <DossierSection title="SHAKING INTENSITY">
              <DossierBandScale
                activeBand={band}
                bands={mmiScale()}
                detail={band.damage}
                tickLabel={(candidate) => candidate.roman}
                value={band.roman}
              />
            </DossierSection>
          </DossierSectionCard>

          <DossierSectionCard>
            <DossierSection title="HYPOCENTER">
              {depth == null ? (
                <div className="text-(length:--sig-text-xs) text-sig-dim">depth unavailable</div>
              ) : (
                <DepthProfile
                  bandClassName={band.className}
                  depthKm={depth}
                />
              )}
            </DossierSection>
          </DossierSectionCard>

          {tsunami && (
            <DossierSectionCard>
              <DossierSection title="WAVE TRAVEL">
                <TsunamiPhysics />
              </DossierSection>
            </DossierSectionCard>
          )}

          {url && (
            <DossierSectionCard>
              <DossierSection title="INTEL LINKS">
                <DossierLinkRow label="USGS Event Detail" href={url} />
                <DossierLinkRow label="USGS ShakeMap" href={`${url}/shakemap`} />
              </DossierSection>
            </DossierSectionCard>
          )}
        </div>
      </div>
    </div>
  );
}

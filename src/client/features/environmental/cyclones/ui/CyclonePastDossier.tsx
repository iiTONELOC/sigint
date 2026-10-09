import type { CSSProperties } from "react";
import { History } from "lucide-react";
import { Domain } from "@shared/domain/identity";
import { BASIN_LABEL } from "@shared/cyclonesSeason";
import type { FeatureDossierProps } from "@/features/base/presentation";
import { useSourceEntity } from "@/features/base/useFreshEntity";
import { useUI } from "@/context/UIContext";
import { formatLat, formatLon } from "@/geo";
import { formatTime } from "@/time";
import { formatKtMph } from "@/measurements";
import { DossierCard, DossierSectionLabel, DossierToolbar, useDossierFocus } from "@/dossier";
import { isCyclonePoint } from "../data/codec";
import { categoryShort, windColor } from "../classification";
import { CyclonePointRowLabel } from "../forecastDefinition";
import { PAST_POINT_LABEL, pastPointName } from "../pastDefinition";
import { formatPressureMb } from "../formatters/units";
import { ParentStrip, Stat, StatGrid } from "./CycloneForecastDossier";

type Props = FeatureDossierProps<Domain.CyclonesPast>;

export function CyclonePastDossier({ item, isolateMode, onLocate, onFocus, onSolo, onClose }: Props) {
  const { data } = item;
  const { setSelected } = useUI();
  const closeBtnRef = useDossierFocus(item.id);
  const entity = useSourceEntity(Domain.Cyclones, data.parentEntityId);
  const parent = isCyclonePoint(entity) ? entity : null;
  return (
    <div className="h-full min-w-0 flex flex-col" style={{ "--dossier-accent": windColor(data.maxWindKt) } as CSSProperties}>
      <DossierToolbar
        icon={History}
        title={pastPointName(data, item.timestamp)}
        subtitle={`${BASIN_LABEL[data.parentBasin]} · ${PAST_POINT_LABEL.toLowerCase()}`}
        badge={categoryShort(data.maxWindKt)}
        isolateMode={isolateMode}
        onLocate={onLocate}
        onFocus={onFocus}
        onSolo={onSolo}
        onClose={onClose}
        closeButtonRef={closeBtnRef}
      />
      <div className="@container/dossier flex-1 min-w-0 overflow-y-auto sigint-scroll p-3">
        <div className="w-full flex flex-col gap-3">
          <section aria-label="At this point">
            <DossierSectionLabel>AT THIS POINT</DossierSectionLabel>
            <DossierCard className="p-3">
              <StatGrid>
                {item.timestamp && <Stat label={CyclonePointRowLabel.Time.toUpperCase()}>{formatTime(item.timestamp)}</Stat>}
                <Stat label="POSITION">{`${formatLat(item.lat)} · ${formatLon(item.lon)}`}</Stat>
                <Stat label={CyclonePointRowLabel.Winds.toUpperCase()}>{formatKtMph(data.maxWindKt)}</Stat>
                <Stat label={CyclonePointRowLabel.Class.toUpperCase()}>
                  <span className="text-(--dossier-accent)">{categoryShort(data.maxWindKt)}</span>
                </Stat>
                {data.minPressureMb != null && (
                  <Stat label={CyclonePointRowLabel.Pressure.toUpperCase()}>{formatPressureMb(data.minPressureMb)}</Stat>
                )}
              </StatGrid>
            </DossierCard>
          </section>
          {parent && <ParentStrip parent={parent} onOpen={() => setSelected(parent)} />}
        </div>
      </div>
    </div>
  );
}

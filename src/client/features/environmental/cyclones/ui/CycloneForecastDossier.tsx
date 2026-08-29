import { Wind } from "lucide-react";
import { Domain } from "@shared/domain/identity";
import { NO_VALUE } from "@shared/text";
import type { FeatureDossierProps } from "@/features/base/presentation";
import { formatLat, formatLon } from "@/geo";
import { formatKtMph } from "@/measurements";
import {
  CYCLONE_CATEGORY_METADATA,
  SaffirSimpson,
} from "@shared/domain/cyclones";
import {
  DossierRow,
  DossierSection,
  DossierToolbar,
  useDossierFocus,
} from "@/dossier";
import { leadTime } from "../forecastDefinition";
import { formatNmKm, formatPressureMb } from "../formatters/units";

type Props = FeatureDossierProps<Domain.CyclonesForecast>;

export function CycloneForecastDossier({
  item,
  isolateMode,
  onLocate,
  onFocus,
  onSolo,
  onClose,
}: Props) {
  const d = item.data;
  const category = CYCLONE_CATEGORY_METADATA[d.category].label;
  const closeBtnRef = useDossierFocus(item.id);
  const badge = d.saffirSimpson > SaffirSimpson.None
    ? `CAT ${d.saffirSimpson}`
    : null;
  return (
    <div className="h-full flex flex-col">
      <DossierToolbar
        icon={Wind}
        title={`${d.parentName} · ${leadTime(d.fcstHour)}`}
        subtitle={`${category} (forecast)`}
        badge={badge}
        isolateMode={isolateMode}
        onLocate={onLocate}
        onFocus={onFocus}
        onSolo={onSolo}
        onClose={onClose}
        closeButtonRef={closeBtnRef}
      />
      <div className="flex-1 overflow-y-auto sigint-scroll">
        <div className="p-3 space-y-3">
          <DossierSection title="FORECAST">
            <DossierRow label="STORM" value={d.parentName} />
            <DossierRow label="BASIN" value={d.parentBasin} />
            <DossierRow label="LEAD TIME" value={leadTime(d.fcstHour)} />
            <DossierRow label="VALID" value={d.validTime || NO_VALUE} />
          </DossierSection>

          <DossierSection title="INTENSITY">
            <DossierRow label="WINDS" value={formatKtMph(d.maxWindKt)} />
            {d.minPressureMb != null && (
              <DossierRow label="PRESSURE" value={formatPressureMb(d.minPressureMb)} />
            )}
            <DossierRow label="CLASS" value={category} />
          </DossierSection>

          <DossierSection title="POSITION">
            <div className="text-(length:--sig-text-sm) font-mono text-sig-bright">
              {formatLat(item.lat)}, {formatLon(item.lon)}
            </div>
          </DossierSection>

          <DossierSection title="UNCERTAINTY">
            <DossierRow label="TRACK ERROR" value={formatNmKm(d.errorRadiusNm)} />
          </DossierSection>
        </div>
      </div>
    </div>
  );
}

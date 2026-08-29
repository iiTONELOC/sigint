import { useCallback, type ComponentType } from "react";
import { Domain } from "@shared/domain/identity";
import { IsolateMode } from "@/workers/render/protocol";
import { Plane } from "lucide-react";
import { useUI } from "@/context/UIContext";
import { filterHeadingColor, useTheme } from "@/theme";
import { useUnitsMode } from "@/preferences/units/useUnitsMode";
import { zoomToThenClear } from "@/selection";
import { featureRegistry } from "@/features/registry";
import type { DataPoint, DataType } from "@/features/base/dataPoints";
import type { FeatureDossierProps } from "@/features/base/presentation";
import { AircraftDossier } from "@/features/tracking/aircraft/ui/AircraftDossier";
import { ShipDossier } from "@/features/tracking/ships/ui/ShipDossier";
import { EventDossier } from "@/features/intel/events/ui/EventDossier";
import { EarthquakeDossier } from "@/features/environmental/earthquake/ui/EarthquakeDossier";
import { FireDossier } from "@/features/environmental/fires/ui/FireDossier";
import { WeatherDossier } from "@/features/environmental/weather/ui/WeatherDossier";
import { CycloneDossier } from "@/features/environmental/cyclones/ui/CycloneDossier";
import { CycloneForecastDossier } from "@/features/environmental/cyclones/ui/CycloneForecastDossier";
import { CycloneWarningDossier } from "@/features/environmental/cyclones/ui/CycloneWarningDossier";

function bindDossier<TType extends DataType>(
  DossierContent: ComponentType<FeatureDossierProps<TType>>,
): ComponentType<FeatureDossierProps> {
  return function BoundDossier(props: FeatureDossierProps) {
    const item = props.item as Extract<
      DataPoint,
      Readonly<{ type: TType }>
    >;
    return <DossierContent {...props} item={item} />;
  };
}

const DOSSIER_RENDERERS = {
  [Domain.Aircraft]: bindDossier<Domain.Aircraft>(AircraftDossier),
  [Domain.Cyclones]:
    bindDossier<Domain.Cyclones>(CycloneDossier),
  [Domain.CyclonesForecast]:
    bindDossier<Domain.CyclonesForecast>(CycloneForecastDossier),
  [Domain.CyclonesWarning]:
    bindDossier<Domain.CyclonesWarning>(CycloneWarningDossier),
  [Domain.Quakes]:
    bindDossier<Domain.Quakes>(EarthquakeDossier),
  [Domain.Events]: bindDossier<Domain.Events>(EventDossier),
  [Domain.Fires]: bindDossier<Domain.Fires>(FireDossier),
  [Domain.Ships]: bindDossier<Domain.Ships>(ShipDossier),
  [Domain.Weather]: bindDossier<Domain.Weather>(WeatherDossier),
} satisfies Readonly<
  Record<DataType, ComponentType<FeatureDossierProps>>
>;

export function DossierPane() {
  const {
    selected,
    selectedCurrent,
    setSelected,
    isolateMode,
    setIsolateMode,
    setZoomToId,
  } = useUI();
  useUnitsMode(); // re-render the dossier body when the units pref flips
  const { theme } = useTheme();

  const handleClose = useCallback(() => {
    setSelected(null);
    setIsolateMode(null);
  }, [setSelected, setIsolateMode]);

  const handleFocus = useCallback(() => {
    const next = isolateMode === IsolateMode.Focus ? null : IsolateMode.Focus;
    setIsolateMode(next);
  }, [isolateMode, setIsolateMode]);

  const handleSolo = useCallback(() => {
    const next = isolateMode === IsolateMode.Solo ? null : IsolateMode.Solo;
    setIsolateMode(next);
  }, [isolateMode, setIsolateMode]);

  const handleLocate = useCallback(() => {
    if (selectedCurrent) {
      zoomToThenClear(setZoomToId, selectedCurrent.id);
    }
  }, [setZoomToId, selectedCurrent]);

  if (!selectedCurrent) {
    return (
      <div className="h-full flex items-center justify-center text-sig-dim">
        <div className="text-center">
          <Plane className="w-8 h-8 mx-auto mb-2 opacity-30" aria-hidden="true" />
          <p>Select a track to view dossier</p>
        </div>
      </div>
    );
  }

  const feature = featureRegistry[selectedCurrent.type];
  const DossierContent = feature ? DOSSIER_RENDERERS[feature.id] : null;
  const body = DossierContent ? (
      <DossierContent
        item={selectedCurrent}
        requestItem={selected}
        isolateMode={isolateMode}
        onLocate={handleLocate}
        onFocus={handleFocus}
        onSolo={handleSolo}
        onClose={handleClose}
      />
    ) : null;

  return (
    <div
      className="h-full"
      style={
        {
          "--dossier-accent": filterHeadingColor(theme, selectedCurrent.type),
        } as React.CSSProperties
      }
    >
      {body}
    </div>
  );
}

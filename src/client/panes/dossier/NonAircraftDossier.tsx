import type { SelectedIsolateMode } from "@/workers/render/protocol";
import type { DataPoint } from "@/features/base/dataPoints";
import { Domain } from "@shared/domain/identity";
import { ShipDossier } from "@/features/tracking/ships/ui/ShipDossier";
import { EventDossier } from "@/features/intel/events/ui/EventDossier";
import { EarthquakeDossier } from "@/features/environmental/earthquake/ui/EarthquakeDossier";
import { FireDossier } from "@/features/environmental/fires/ui/FireDossier";
import { WeatherDossier } from "@/features/environmental/weather/ui/WeatherDossier";
import { CycloneDossier } from "@/features/environmental/cyclones/ui/CycloneDossier";
import { CycloneForecastDossier } from "@/features/environmental/cyclones/ui/CycloneForecastDossier";
import { CycloneWarningDossier } from "@/features/environmental/cyclones/ui/CycloneWarningDossier";

type Props = {
  readonly item: DataPoint;
  readonly isolateMode: SelectedIsolateMode;
  readonly onLocate: () => void;
  readonly onFocus: () => void;
  readonly onSolo: () => void;
  readonly onClose: () => void;
};

export function NonAircraftDossier(props: Props) {
  const { item } = props;
  switch (item.type) {
    case Domain.Ships:
      return <ShipDossier {...props} item={item} />;
    case Domain.Events:
      return <EventDossier {...props} item={item} />;
    case Domain.Quakes:
      return <EarthquakeDossier {...props} item={item} />;
    case Domain.Fires:
      return <FireDossier {...props} item={item} />;
    case Domain.Weather:
      return <WeatherDossier {...props} item={item} />;
    case Domain.Cyclones:
      return <CycloneDossier {...props} item={item} />;
    case Domain.CyclonesForecast:
      return <CycloneForecastDossier {...props} item={item} />;
    case Domain.CyclonesWarning:
      return <CycloneWarningDossier {...props} item={item} />;
    default:
      return null;
  }
}

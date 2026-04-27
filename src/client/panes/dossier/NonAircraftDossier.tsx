import type { DataPoint } from "@/features/base/dataPoints";
import { ShipDossier } from "@/features/tracking/ships/ui/ShipDossier";
import { EventDossier } from "@/features/intel/events/ui/EventDossier";
import { EarthquakeDossier } from "@/features/environmental/earthquake/ui/EarthquakeDossier";
import { FireDossier } from "@/features/environmental/fires/ui/FireDossier";
import { WeatherDossier } from "@/features/environmental/weather/ui/WeatherDossier";
import { CycloneDossier } from "@/features/environmental/cyclones/ui/CycloneDossier";

// Dispatcher — picks the per-feature dossier for the selected DataPoint.
// Each feature's dossier body lives at features/{feature}/ui/{Feature}Dossier.tsx.

type Props = {
  readonly item: DataPoint;
  readonly isolateMode: null | "solo" | "focus";
  readonly onLocate: () => void;
  readonly onFocus: () => void;
  readonly onSolo: () => void;
  readonly onClose: () => void;
};

export function NonAircraftDossier(props: Props) {
  switch (props.item.type) {
    case "ships":
      return <ShipDossier {...props} />;
    case "events":
      return <EventDossier {...props} />;
    case "quakes":
      return <EarthquakeDossier {...props} />;
    case "fires":
      return <FireDossier {...props} />;
    case "weather":
      return <WeatherDossier {...props} />;
    case "cyclones":
      return <CycloneDossier {...(props as Props & { item: Parameters<typeof CycloneDossier>[0]["item"] })} />;
    default:
      return null;
  }
}

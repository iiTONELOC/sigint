import {
  AircraftProvider,
  type AircraftProviderConfig,
} from "@/domain/providers/aircraft/AircraftProvider";

export function createAircraftProvider(
  config: AircraftProviderConfig = {},
): AircraftProvider {
  return new AircraftProvider(config);
}

import { startGdeltPolling } from "./api/gdeltCache";
import { startAisPolling } from "./api/aisCache";
import { startFirmsPolling } from "./api/firmsCache";
import { startNewsPolling } from "./api/newsCache";
import { startCyclonesPolling } from "./api/cyclonesCache";
import { startAircraftPolling } from "./api/aircraftCache";
import type { ServerConfig } from "./config";

/** Start every background data poller. Shared by the dev + prod entry points so
 *  the two stay in lockstep (a poller added in one but not the other is exactly
 *  how the cyclone warnings broke on prod). */
export function startAllPolling(config: ServerConfig): void {
  startGdeltPolling();
  startAisPolling(config.aisstreamApiKey);
  startFirmsPolling(config.firmsMapKey);
  startNewsPolling();
  startCyclonesPolling({
    enabled: config.fixtureOverridesEnabled,
    label: process.env.CYCLONES_FIXTURE,
  });
  startAircraftPolling({
    enabled: config.fixtureOverridesEnabled,
    label: process.env.AIRCRAFT_FIXTURE,
  });
}

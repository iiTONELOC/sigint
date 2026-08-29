import { startGdeltPolling } from "./api/gdeltCache";
import { startAisPolling } from "./api/aisCache";
import { startFirmsPolling } from "./api/firmsCache";
import { startNewsPolling } from "./api/newsCache";
import { startCyclonesPolling } from "./api/cyclonesCache";
import { startAircraftPolling } from "./api/aircraftCache";
import { ConfigField, type ServerConfig } from "./config";

export function startAllPolling(config: ServerConfig): void {
  startGdeltPolling();
  startAisPolling(config.aisstreamApiKey);
  startFirmsPolling();
  startNewsPolling();
  startCyclonesPolling({
    enabled: config.fixtureOverridesEnabled,
    label: process.env[ConfigField.CyclonesFixture],
  });
  startAircraftPolling({
    enabled: config.fixtureOverridesEnabled,
    label: process.env[ConfigField.AircraftFixture],
  });
}

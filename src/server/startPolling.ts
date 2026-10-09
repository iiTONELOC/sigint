import { startGdeltPolling, stopGdeltPolling } from "./api/gdeltCache";
import { startAisPolling, stopAisPolling } from "./api/aisCache";
import { startFirmsPolling, stopFirmsPolling } from "./api/firmsCache";
import { startNewsPolling, stopNewsPolling } from "./api/newsCache";
import { startCyclonesPolling, stopCyclonesPolling } from "./api/cyclonesCache";
import { startAircraftPolling, stopAircraftPolling } from "./api/aircraftCache";
import { ConfigField, type ServerConfig } from "./config";

const STOP_PREVIOUS_POLLING = Symbol.for("sigint.server.stopPolling");

type PollingHost = typeof globalThis & { [STOP_PREVIOUS_POLLING]?: () => void };

function stopAllPolling(): void {
  stopGdeltPolling();
  stopAisPolling();
  stopFirmsPolling();
  stopNewsPolling();
  stopCyclonesPolling();
  stopAircraftPolling();
}

export function startAllPolling(config: ServerConfig): void {
  // bun --hot reloads modules but keeps the old module's loops, sockets, and
  // timers alive, so each reload would add another set of upstream pollers.
  const host: PollingHost = globalThis;
  host[STOP_PREVIOUS_POLLING]?.();
  host[STOP_PREVIOUS_POLLING] = stopAllPolling;

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

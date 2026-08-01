import type { WalkthroughStep } from "./types";
import {
  WalkthroughPlacement,
  WalkthroughSelector,
  WalkthroughStepId,
  WalkthroughStepMode,
  WalkthroughTourTarget,
  walkthroughTourSelector,
} from "./vocabulary";

export function welcomeStep(
  placement: WalkthroughPlacement,
): WalkthroughStep {
  return {
    id: WalkthroughStepId.Welcome,
    targetSelector: walkthroughTourSelector(
      WalkthroughTourTarget.HeaderBrand,
    ),
    title: "Welcome to SIGINT",
    description:
      "Real-time global intelligence dashboard with live aircraft, vessel, seismic, fire, weather, and event tracking.",
    placement,
    mode: WalkthroughStepMode.Information,
  };
}

export function layersStep(
  placement: WalkthroughPlacement,
  highlight: boolean,
): WalkthroughStep {
  const selector = walkthroughTourSelector(
    WalkthroughTourTarget.LayerToggles,
  );
  return {
    id: WalkthroughStepId.Layers,
    targetSelector: selector,
    title: "Data Layers",
    description:
      "Toggle layers on and off: aircraft, vessels, seismic, fires, weather, and GDELT events. Each layer is color-coded.",
    placement,
    mode: WalkthroughStepMode.Information,
    buttonSelector: highlight ? selector : undefined,
  };
}

export const SEARCH_STEP: WalkthroughStep = {
  id: WalkthroughStepId.Search,
  targetSelector: WalkthroughSelector.None,
  title: "Global Search",
  description:
    "Search across all data: callsigns, vessel names, and locations. Results filter the globe in real time. Try it or press NEXT.",
  placement: WalkthroughPlacement.Center,
  mode: WalkthroughStepMode.Information,
  buttonSelector: walkthroughTourSelector(WalkthroughTourTarget.Search),
};

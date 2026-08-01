import { hydrateCyclonePreference } from "./cyclones";
import { hydrateUnitsPreference } from "./units";

export async function hydratePreferences(): Promise<void> {
  await Promise.all([
    hydrateCyclonePreference(),
    hydrateUnitsPreference(),
  ]);
}

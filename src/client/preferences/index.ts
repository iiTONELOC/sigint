import { hydrateCyclonePreference } from "./cyclones";
import { hydrateUnitsPreference } from "./units";

export async function hydratePreferences(): Promise<void> {
  await hydrateCyclonePreference();
  await hydrateUnitsPreference();
}

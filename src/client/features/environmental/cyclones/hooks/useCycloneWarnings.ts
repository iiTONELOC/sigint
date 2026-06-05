// ── useCycloneWarnings ───────────────────────────────────────────────
// Polls /api/cyclones/warnings for the current tropical watch/warning
// polygons. Separate from the DataPoint provider path because warnings are
// region geometry, not points. Mirrors useProviderData's poll + refresh-on-
// visibility cadence so a backgrounded tab catches up on focus.

import { useEffect, useState } from "react";
import {
  fetchCycloneWarnings,
  type CycloneWarning,
} from "../data/warnings";

const POLL_INTERVAL_MS = 5 * 60_000; // matches the server cache cadence

export function useCycloneWarnings(): CycloneWarning[] {
  const [warnings, setWarnings] = useState<CycloneWarning[]>([]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const next = await fetchCycloneWarnings();
        if (mounted) setWarnings(next);
      } catch {
        // Non-fatal: a warnings outage must not break the globe.
      }
    };

    void load();
    const id = setInterval(() => void load(), POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      mounted = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return warnings;
}

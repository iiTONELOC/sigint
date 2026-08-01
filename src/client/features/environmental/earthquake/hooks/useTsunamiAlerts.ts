import { useEffect, useState } from "react";
import { DomEvent, DomVisibilityState } from "@/runtime";
import { fetchTsunamiAlerts, type TsunamiAlert } from "../data/tsunamiAlerts";

const POLL_INTERVAL_MS = 5 * 60_000;

export function useTsunamiAlerts(): TsunamiAlert[] {
  const [alerts, setAlerts] = useState<TsunamiAlert[]>([]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const next = await fetchTsunamiAlerts();
      if (mounted) setAlerts(next);
    };
    load();
    const id = setInterval(() => {
      load();
    }, POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === DomVisibilityState.Visible) {
        load();
      }
    };
    document.addEventListener(DomEvent.VisibilityChange, onVisible);
    return () => {
      mounted = false;
      clearInterval(id);
      document.removeEventListener(DomEvent.VisibilityChange, onVisible);
    };
  }, []);

  return alerts;
}

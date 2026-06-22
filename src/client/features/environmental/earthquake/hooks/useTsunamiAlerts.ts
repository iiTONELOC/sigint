import { useEffect, useState } from "react";
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

  return alerts;
}

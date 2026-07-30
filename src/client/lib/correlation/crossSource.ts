// ── Cross-source correlation rules ──────────────────────────────────
// Spatial-temporal matching across data types using the 2° grid index.
// Each rule is O(n) — query points check ~9 neighboring cells.

import type { DataPoint } from "@/features/base/dataPoints";
import {
  CROSS_SOURCE_RADIUS_KM,
  CROSS_SOURCE_TIME_WINDOW,
  MIL_QUERY_RADIUS_DEG,
  QUERY_RADIUS_DEG,
  buildGrid,
  getTs,
  gridQuery,
  haversineKm,
} from "./shared";

export type CrossCorrelation = {
  primary: DataPoint;
  correlated: DataPoint[];
  types: Set<string>;
  description: string;
};

export function findCrossSourceCorrelations(
  items: DataPoint[],
): CrossCorrelation[] {
  const results: CrossCorrelation[] = [];
  const now = Date.now();

  const byType = new Map<string, DataPoint[]>();
  for (const item of items) {
    let arr = byType.get(item.type);
    if (!arr) {
      arr = [];
      byType.set(item.type, arr);
    }
    arr.push(item);
  }

  const events = byType.get("events") ?? [];
  const fires = byType.get("fires") ?? [];
  const quakes = byType.get("quakes") ?? [];
  const weather = byType.get("weather") ?? [];
  const ships = byType.get("ships") ?? [];
  const aircraft = byType.get("aircraft") ?? [];

  const fireGrid = fires.length > 0 ? buildGrid(fires) : null;
  const shipGrid = ships.length > 0 ? buildGrid(ships) : null;
  const eventGrid = events.length > 0 ? buildGrid(events) : null;

  // GDELT conflict + nearby fire
  if (fireGrid) {
    for (const evt of events) {
      const evtSev = ((evt.data as any).severity as number) ?? 0;
      if (evtSev < 3) continue;
      const evtTs = getTs(evt);
      if (now - evtTs > CROSS_SOURCE_TIME_WINDOW) continue;

      const candidates = gridQuery(
        fireGrid,
        evt.lat,
        evt.lon,
        QUERY_RADIUS_DEG,
      );
      const nearby = candidates.filter((f) => {
        const fTs = getTs(f);
        if (Math.abs(evtTs - fTs) > CROSS_SOURCE_TIME_WINDOW) return false;
        return (
          haversineKm(evt.lat, evt.lon, f.lat, f.lon) < CROSS_SOURCE_RADIUS_KM
        );
      });

      if (nearby.length > 0) {
        results.push({
          primary: evt,
          correlated: nearby,
          types: new Set(["events", "fires"]),
          description: `Conflict event with ${nearby.length} fire detection${nearby.length > 1 ? "s" : ""} within ${CROSS_SOURCE_RADIUS_KM}km`,
        });
      }
    }
  }

  // Earthquake + subsequent fire
  if (fireGrid) {
    for (const eq of quakes) {
      const mag = ((eq.data as any).magnitude as number) ?? 0;
      if (mag < 4.5) continue;
      const eqTs = getTs(eq);
      if (now - eqTs > CROSS_SOURCE_TIME_WINDOW) continue;

      const candidates = gridQuery(fireGrid, eq.lat, eq.lon, QUERY_RADIUS_DEG);
      const nearby = candidates.filter((f) => {
        const fTs = getTs(f);
        if (fTs < eqTs) return false;
        if (fTs - eqTs > CROSS_SOURCE_TIME_WINDOW) return false;
        return (
          haversineKm(eq.lat, eq.lon, f.lat, f.lon) < CROSS_SOURCE_RADIUS_KM
        );
      });

      if (nearby.length > 0) {
        results.push({
          primary: eq,
          correlated: nearby,
          types: new Set(["quakes", "fires"]),
          description: `M${mag.toFixed(1)} earthquake with ${nearby.length} subsequent fire detection${nearby.length > 1 ? "s" : ""} nearby`,
        });
      }
    }
  }

  // Severe weather + ship density
  if (shipGrid) {
    for (const wx of weather) {
      const sev = (wx.data as any).severity as string;
      if (sev !== "Extreme" && sev !== "Severe") continue;

      const candidates = gridQuery(shipGrid, wx.lat, wx.lon, QUERY_RADIUS_DEG);
      const nearby = candidates.filter(
        (s) =>
          haversineKm(wx.lat, wx.lon, s.lat, s.lon) < CROSS_SOURCE_RADIUS_KM,
      );

      if (nearby.length >= 3) {
        results.push({
          primary: wx,
          correlated: nearby,
          types: new Set(["weather", "ships"]),
          description: `${sev} weather alert with ${nearby.length} vessels in affected area`,
        });
      }
    }
  }

  // Military aircraft in conflict zone
  if (eventGrid) {
    const milAircraft = aircraft.filter(
      (a) => (a.data as any).military === true,
    );
    for (const ac of milAircraft) {
      const candidates = gridQuery(
        eventGrid,
        ac.lat,
        ac.lon,
        MIL_QUERY_RADIUS_DEG,
      );
      const nearby = candidates.filter((evt) => {
        const evtSev = ((evt.data as any).severity as number) ?? 0;
        if (evtSev < 3) return false;
        return haversineKm(ac.lat, ac.lon, evt.lat, evt.lon) < 200;
      });

      if (nearby.length > 0) {
        results.push({
          primary: ac,
          correlated: nearby,
          types: new Set(["aircraft", "events"]),
          description: `Military aircraft operating near ${nearby.length} conflict event${nearby.length > 1 ? "s" : ""}`,
        });
      }
    }
  }

  return results;
}

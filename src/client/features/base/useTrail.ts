import { useEffect, useState } from "react";
import {
  getDataWorkerClient,
} from "@/lib/cache/dataWorkerClient";
import type {
  TrackSource,
  TrailEntry,
  TrailPoint,
} from "@/lib/geo/trails/trailStore";
import {
  useSourceSnapshot,
} from "@/features/base/useSourceQuery";

export function useTrail(
  id: string,
  source: TrackSource,
): readonly TrailPoint[] {
  const sourceVersion = useSourceSnapshot(source)?.version;
  const [entry, setEntry] = useState<TrailEntry | null>(null);

  useEffect(() => {
    let active = true;
    setEntry(null);
    const client = getDataWorkerClient();
    if (!client) return;
    void client.getTrail(id).then(
      (next) => {
        if (active) setEntry(next);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [id, source, sourceVersion]);

  return entry?.type === source ? entry.points : [];
}

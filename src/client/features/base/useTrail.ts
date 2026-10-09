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

type TrailState = Readonly<{ id: string; entry: TrailEntry | null }>;

export function useTrail(
  id: string,
  source: TrackSource,
): readonly TrailPoint[] {
  const sourceVersion = useSourceSnapshot(source)?.version;
  const [state, setState] = useState<TrailState | null>(null);

  useEffect(() => {
    let active = true;
    const client = getDataWorkerClient();
    if (!client) return;
    void client.getTrail(id).then(
      (entry) => {
        if (active) setState({ id, entry });
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [id, source, sourceVersion]);

  const entry = state?.id === id ? state.entry : null;
  return entry?.type === source ? entry.points : [];
}

import { useEffect, useMemo, useState } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { useSourceSnapshot } from "@/features/base/useSourceQuery";
import { sourceForPointType } from "@shared/domain/pointSource";
import { getDataWorkerClient } from "@/lib/cache/dataWorkerClient";
import {
  QUERYABLE_SOURCE_CODECS,
  type QueryableSourceId,
} from "@/workers/data/queryableSources";

export function useSourceEntity(
  source: QueryableSourceId | null,
  id: string | null,
): DataPoint | null {
  const client = useMemo(getDataWorkerClient, []);
  const snapshot = useSourceSnapshot(source);
  const [fresh, setFresh] = useState<DataPoint | null>(null);

  useEffect(() => {
    if (!client || !id || !source) {
      setFresh(null);
      return;
    }
    let cancelled = false;
    void client
      .getSourceEntity(source, id)
      .then((event) => {
        if (cancelled || event.source !== source) return;
        // Re-parsed rather than narrowed: the reply union cannot be narrowed
        // by a source id held in state, and this is a single record.
        setFresh(QUERYABLE_SOURCE_CODECS[source].parseEntity(event.value));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [client, source, id, snapshot?.version]);

  return fresh?.id === id ? fresh : null;
}

export function useFreshEntity(point: DataPoint | null): DataPoint | null {
  const fresh = useSourceEntity(
    point ? sourceForPointType(point.type) : null,
    point?.id ?? null,
  );
  if (!point) return null;
  return fresh ?? point;
}

import { useEffect, useMemo, useState } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { useSourceSnapshot } from "@/features/base/useSourceQuery";
import { sourceForPointType } from "@/features/base/useSourceTables";
import { getDataWorkerClient } from "@/lib/cache/dataWorkerClient";
import { QUERYABLE_SOURCE_CODECS } from "@/workers/data/queryableSources";

/**
 * The DataWorker's current copy of one point, refetched when the selection
 * changes and when its source advances. Falls back to the point the caller
 * already holds, so a selection never blanks out while a fetch is in flight.
 */
export function useFreshEntity(point: DataPoint | null): DataPoint | null {
  const client = useMemo(getDataWorkerClient, []);
  const source = point ? sourceForPointType(point.type) : null;
  const snapshot = useSourceSnapshot(source);
  const [fresh, setFresh] = useState<DataPoint | null>(null);

  useEffect(() => {
    if (!client || !point || !source) {
      setFresh(null);
      return;
    }
    let cancelled = false;
    void client
      .getSourceEntity(source, point.id)
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
  }, [client, source, point?.id, snapshot?.version]);

  if (!point) return null;
  return fresh?.id === point.id ? fresh : point;
}

import { Domain } from "@shared/domain/identity";
import {
  useSourceQuery,
  useSourceSnapshot,
} from "@/features/base/useSourceQuery";
import type {
  FireUiQuery,
  FireUiQueryResult,
} from "@/features/environmental/fires/data/uiQueries";
import type { DataWorkerSourceSnapshot } from "@/workers/data/protocol";

export function useFireSourceSnapshot(): DataWorkerSourceSnapshot | null {
  return useSourceSnapshot(Domain.Fire);
}

export function useFireUiQuery(
  query: FireUiQuery | null,
): FireUiQueryResult | null {
  return useSourceQuery(Domain.Fire, query);
}

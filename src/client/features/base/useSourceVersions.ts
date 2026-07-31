import { useSourceSnapshot } from "@/features/base/useSourceQuery";
import { Domain } from "@shared/domain/identity";

/**
 * One number that advances whenever any source in the DataWorker does. Use it
 * to gate work that depends on the whole record set without holding any of it.
 */
export function useSourceVersions(): number {
  const versions = [
    useSourceSnapshot(Domain.Aircraft)?.version ?? 0,
    useSourceSnapshot(Domain.Ships)?.version ?? 0,
    useSourceSnapshot(Domain.Events)?.version ?? 0,
    useSourceSnapshot(Domain.Earthquake)?.version ?? 0,
    useSourceSnapshot(Domain.Fire)?.version ?? 0,
    useSourceSnapshot(Domain.Weather)?.version ?? 0,
    useSourceSnapshot(Domain.Cyclones)?.version ?? 0,
  ];
  return versions.reduce((sum, version) => sum + version, 0);
}

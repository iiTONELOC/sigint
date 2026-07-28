import { useSourceSnapshot } from "@/features/base/useSourceQuery";

/**
 * One number that advances whenever any source in the DataWorker does. Use it
 * to gate work that depends on the whole record set without holding any of it.
 */
export function useSourceVersions(): number {
  const versions = [
    useSourceSnapshot("aircraft")?.version ?? 0,
    useSourceSnapshot("ships")?.version ?? 0,
    useSourceSnapshot("events")?.version ?? 0,
    useSourceSnapshot("earthquake")?.version ?? 0,
    useSourceSnapshot("fire")?.version ?? 0,
    useSourceSnapshot("weather")?.version ?? 0,
    useSourceSnapshot("cyclones")?.version ?? 0,
  ];
  return versions.reduce((sum, version) => sum + version, 0);
}

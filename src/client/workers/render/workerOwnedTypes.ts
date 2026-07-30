import { Domain } from "@shared/domain/identity";
import type { DataType } from "@/features/base/dataPoints";

/**
 * Point types the render worker gets straight from the DataWorker. Aircraft,
 * ships, and quakes use scene patches. Fires still use packed buffers. The
 * React bridge must not send them, and the worker ignores them if it does.
 *
 * One owner for both ends. A type joins this set the moment its worker source
 * lands, and the legacy `RenderPoint[]` path shrinks by exactly that much.
 */
export const WORKER_OWNED_POINT_TYPES: ReadonlySet<DataType> = new Set<DataType>([
  Domain.Aircraft,
  Domain.Ships,
  Domain.Quakes,
  Domain.Fires,
]);

export function isWorkerOwnedPointType(type: DataType): boolean {
  return WORKER_OWNED_POINT_TYPES.has(type);
}

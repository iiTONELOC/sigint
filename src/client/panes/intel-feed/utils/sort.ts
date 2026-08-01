import type { DataPoint } from "@/features/base/dataPoints";

function timestamp(item: DataPoint): number {
  return item.timestamp ? new Date(item.timestamp).getTime() : 0;
}

export function compareNewestFirst(
  left: DataPoint,
  right: DataPoint,
): number {
  return timestamp(right) - timestamp(left);
}

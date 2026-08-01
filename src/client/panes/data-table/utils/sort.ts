import type { DataPoint } from "@/features/base/dataPoints";
import {
  emptyFeatureTablePresentation,
  type FeatureTablePresentation,
} from "@/features/base/presentation";
import { featureRegistry } from "@/features/registry";
import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
import {
  TableSortDirection,
  TableSortKey,
} from "@/workers/data/uiQuery";

export function dataPointTablePresentation(
  item: DataPoint,
): FeatureTablePresentation {
  const feature = featureRegistry.get(item.type);
  return feature
    ? feature.tablePresentation(item.data, item.id)
    : emptyFeatureTablePresentation(item.id, item.type.toUpperCase());
}

function pointAge(item: DataPoint): number {
  if (!item.timestamp) return 0;
  return Date.now() - new Date(item.timestamp).getTime();
}

export function compareDataTablePoints(
  left: DataPoint,
  right: DataPoint,
  sortKey: TableSortKey,
  sortDirection: TableSortDirection,
): number {
  const leftPresentation = dataPointTablePresentation(left);
  const rightPresentation = dataPointTablePresentation(right);
  let comparison = 0;

  if (sortKey === TableSortKey.Type) {
    comparison = left.type.localeCompare(right.type);
  } else if (sortKey === TableSortKey.Name) {
    comparison = leftPresentation.name.localeCompare(rightPresentation.name);
  } else if (sortKey === TableSortKey.Latitude) {
    comparison = recordLatitude(left) - recordLatitude(right);
  } else if (sortKey === TableSortKey.Longitude) {
    comparison = recordLongitude(left) - recordLongitude(right);
  } else if (sortKey === TableSortKey.Value1) {
    comparison =
      leftPresentation.classificationRank -
        rightPresentation.classificationRank ||
      leftPresentation.classification.localeCompare(
        rightPresentation.classification,
      );
  } else if (sortKey === TableSortKey.Value2) {
    comparison =
      leftPresentation.detailRank - rightPresentation.detailRank;
  } else {
    comparison = pointAge(left) - pointAge(right);
  }

  return (
    comparison *
    (sortDirection === TableSortDirection.Ascending ? 1 : -1)
  );
}

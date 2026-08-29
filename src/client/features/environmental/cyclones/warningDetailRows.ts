import {
  buildDetailRows,
  detailRowLabels,
  type DetailRow,
} from "@/features/base/detailRows";
import {
  CYCLONE_WARNING_FIELDS,
  CycloneWarningField,
  type CycloneWarningData,
} from "@shared/domain/cyclones";

const WARNING_SEVERITY_LABEL = "Severity";

const WARNING_ROW_LABELS = detailRowLabels(CycloneWarningField);
const WARNING_TIME_FIELDS: ReadonlySet<CycloneWarningField> = new Set([
  CycloneWarningField.Effective,
  CycloneWarningField.Expires,
]);

function warningRows(
  data: CycloneWarningData,
  includeToolbarRows: boolean,
): DetailRow[] {
  const order = includeToolbarRows
    ? CYCLONE_WARNING_FIELDS
    : CYCLONE_WARNING_FIELDS.filter(
        (field) => field !== CycloneWarningField.Alert,
      );
  const rows = buildDetailRows({
    order,
    labels: WARNING_ROW_LABELS,
    timeFields: WARNING_TIME_FIELDS,
    read: (field) => data[field],
  });
  if (includeToolbarRows) {
    rows.splice(1, 0, [
      WARNING_SEVERITY_LABEL,
      data.kind.toUpperCase(),
    ]);
  }
  return rows;
}

export function buildWarningDetailRows(
  data: CycloneWarningData,
): DetailRow[] {
  return warningRows(data, true);
}

export function buildWarningDossierRows(
  data: CycloneWarningData,
): DetailRow[] {
  return warningRows(data, false);
}

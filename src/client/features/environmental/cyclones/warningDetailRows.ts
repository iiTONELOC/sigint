import { formatTime } from "@/lib/format/timeFormat";
import { CycloneWarningField, type CycloneWarningData } from "./types";

enum WarningRowLabel {
  Alert = "Alert",
  Severity = "Severity",
  Area = "Area",
  Headline = "Headline",
  Effective = "Effective",
  Expires = "Expires",
}

type WarningRowReader = (data: CycloneWarningData) => string;

const ROWS: readonly (readonly [WarningRowLabel, WarningRowReader])[] = [
  [WarningRowLabel.Alert, (data) => data[CycloneWarningField.Alert]],
  [WarningRowLabel.Severity, (data) => data.kind.toUpperCase()],
  [WarningRowLabel.Area, (data) => data[CycloneWarningField.Area]],
  [WarningRowLabel.Headline, (data) => data[CycloneWarningField.Headline]],
  [
    WarningRowLabel.Effective,
    (data) => formatTime(data[CycloneWarningField.Effective]),
  ],
  [
    WarningRowLabel.Expires,
    (data) => formatTime(data[CycloneWarningField.Expires]),
  ],
];

// The dossier toolbar already carries these as its title and its badge.
const TOOLBAR_ROWS: ReadonlySet<WarningRowLabel> = new Set([
  WarningRowLabel.Alert,
  WarningRowLabel.Severity,
]);

function build(
  data: CycloneWarningData,
  skip: ReadonlySet<WarningRowLabel>,
): [string, string][] {
  const rows: [string, string][] = [];
  for (const [label, read] of ROWS) {
    if (skip.has(label)) continue;
    const value = read(data);
    if (value) rows.push([label, value]);
  }
  return rows;
}

const NO_ROWS_SKIPPED: ReadonlySet<WarningRowLabel> = new Set();

export function buildWarningDetailRows(
  data: CycloneWarningData,
): [string, string][] {
  return build(data, NO_ROWS_SKIPPED);
}

export function buildWarningDossierRows(
  data: CycloneWarningData,
): [string, string][] {
  return build(data, TOOLBAR_ROWS);
}

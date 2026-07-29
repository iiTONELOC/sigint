import { relativeAge, formatTime } from "@/lib/format/timeFormat";
import { weatherSeverityLabel } from "./severity";
import { WeatherTextField, type WeatherData } from "./types";

enum WeatherDerivedRow {
  Severity = "severity",
  Issued = "issued",
}

type WeatherRow = WeatherTextField | WeatherDerivedRow;

const ROW_ORDER: readonly WeatherRow[] = [
  WeatherTextField.Event,
  WeatherDerivedRow.Severity,
  WeatherTextField.Urgency,
  WeatherTextField.Certainty,
  WeatherTextField.Category,
  WeatherTextField.Response,
  WeatherTextField.Issuer,
  WeatherTextField.Area,
  WeatherTextField.Onset,
  WeatherTextField.Expires,
  WeatherTextField.Headline,
  WeatherDerivedRow.Issued,
];

const ROW_LABEL: ReadonlyMap<string, string> = new Map(
  [
    ...Object.entries(WeatherTextField),
    ...Object.entries(WeatherDerivedRow),
  ].map(([label, row]) => [row, label]),
);

const TIME_FIELDS: ReadonlySet<WeatherRow> = new Set([
  WeatherTextField.Onset,
  WeatherTextField.Expires,
]);

const AGE_FORMAT = "verbose";

function issuedText(timestamp: string): string {
  const issuedAt = new Date(timestamp).getTime();
  return `${formatTime(timestamp)} (${relativeAge(issuedAt, AGE_FORMAT)})`;
}

function rowValue(
  row: WeatherRow,
  data: WeatherData,
  timestamp: string | undefined,
): string | undefined {
  if (row === WeatherDerivedRow.Severity) {
    return data.severity ? weatherSeverityLabel(data.severity) : undefined;
  }
  if (row === WeatherDerivedRow.Issued) {
    return timestamp ? issuedText(timestamp) : undefined;
  }
  const value = data[row];
  if (!value) return undefined;
  return TIME_FIELDS.has(row) ? formatTime(value) : value;
}

export function buildWeatherDetailRows(
  data: WeatherData,
  timestamp?: string,
): [string, string][] {
  const rows: [string, string][] = [];
  for (const row of ROW_ORDER) {
    const value = rowValue(row, data, timestamp);
    if (value) rows.push([ROW_LABEL.get(row) ?? row, value]);
  }
  return rows;
}

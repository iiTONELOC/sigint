import { formatTime } from "@/lib/format/timeFormat";

export type DetailRow = [string, string];

export type EnumMembers = Readonly<Record<string, string>>;

/**
 * A field enum names the payload key in its value and the dossier label in its
 * member name, so the label map is the enum read backwards.
 */
export function detailRowLabels(
  ...members: readonly EnumMembers[]
): ReadonlyMap<string, string> {
  return new Map(
    members.flatMap((member) =>
      Object.entries(member).map(([label, row]): [string, string] => [
        row,
        label,
      ]),
    ),
  );
}

export type DetailRowSpec<TRow extends string> = Readonly<{
  order: readonly TRow[];
  labels: ReadonlyMap<string, string>;
  timeFields?: ReadonlySet<TRow>;
  read: (row: TRow) => string | undefined;
}>;

export function buildDetailRows<TRow extends string>(
  spec: DetailRowSpec<TRow>,
): DetailRow[] {
  const rows: DetailRow[] = [];
  for (const row of spec.order) {
    const value = spec.read(row);
    if (!value) continue;
    const text = spec.timeFields?.has(row) ? formatTime(value) : value;
    rows.push([spec.labels.get(row) ?? row, text]);
  }
  return rows;
}

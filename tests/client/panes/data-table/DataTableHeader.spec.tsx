import { describe, expect, mock, test } from "bun:test";
import type { ReactElement } from "react";
import { TooltipPlacement } from "@/components/Tooltip";
import {
  TableSortDirection,
  TableSortKey,
} from "@/workers/data/uiQuery";
import { renderReact } from "../../../support/react";

enum DataTableHeaderFixtureCount {
  Columns = 8,
}

enum DataTableHeaderFixtureLabel {
  Classification = "CLS",
  Longitude = "LON",
  Type = "TYPE",
}

type TooltipFixtureProps = Readonly<{ children: ReactElement }>;

mock.module("@/components/Tooltip", () => ({
  Tooltip: ({ children }: TooltipFixtureProps) => children,
  TooltipPlacement,
}));

const { DataTableHeader } = await import(
  "@/panes/data-table/components/DataTableHeader"
);
const { DataTableClassName } = await import("@/panes/data-table/model/table");

function noop(): void {}

function headerCells(): HTMLTableCellElement[] {
  const { container } = renderReact(
    <DataTableHeader
      onSort={noop}
      sortDirection={TableSortDirection.Ascending}
      sortKey={TableSortKey.Type}
    />,
  );
  return Array.from(container.querySelectorAll("th"));
}

function cellWithLabel(
  cells: readonly HTMLTableCellElement[],
  label: DataTableHeaderFixtureLabel,
): HTMLTableCellElement | undefined {
  return cells.find((cell) => cell.textContent?.includes(label));
}

function isWideOnly(cell: HTMLTableCellElement | undefined): boolean {
  return DataTableClassName.WideOnly.split(" ").every((token) =>
    cell?.classList.contains(token),
  );
}

describe("DataTableHeader", () => {
  test("renders every column and marks the wide-only ones", () => {
    const cells = headerCells();

    expect(cells).toHaveLength(DataTableHeaderFixtureCount.Columns);
    expect(isWideOnly(cellWithLabel(cells, DataTableHeaderFixtureLabel.Type))).toBe(false);
    expect(isWideOnly(cellWithLabel(cells, DataTableHeaderFixtureLabel.Classification))).toBe(true);
    expect(isWideOnly(cellWithLabel(cells, DataTableHeaderFixtureLabel.Longitude))).toBe(true);
  });
});

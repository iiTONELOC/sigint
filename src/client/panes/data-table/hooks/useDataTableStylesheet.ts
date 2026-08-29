import { useEffect, useId, useMemo } from "react";
import { RuntimeStylesheet } from "@/styles";
import { DataTableVirtualization } from "../model/table";

enum DataTableStyleAttribute {
  Body = "data-data-table-body",
  Row = "data-data-table-row",
}

enum DataTableCssUnit {
  Pixel = "px",
}

type DataTableGeometry = Readonly<{
  offsetY: number;
  totalHeight: number;
}>;

type DataTableStyleAttributes = Readonly<{
  body: Readonly<Record<DataTableStyleAttribute.Body, string>>;
  row: Readonly<Record<DataTableStyleAttribute.Row, string>>;
}>;

const dataTableStylesheet = new RuntimeStylesheet();

function dataTableRules(
  ownerId: string,
  geometry: DataTableGeometry,
): readonly string[] {
  const selectorId = JSON.stringify(ownerId);
  const totalHeight = Math.max(0, geometry.totalHeight);
  const offsetY = Math.max(0, geometry.offsetY);
  return [
    `[${DataTableStyleAttribute.Body}=${selectorId}]{height:${totalHeight}${DataTableCssUnit.Pixel}}`,
    `[${DataTableStyleAttribute.Row}=${selectorId}]{height:${DataTableVirtualization.RowHeight}${DataTableCssUnit.Pixel};transform:translateY(${offsetY}${DataTableCssUnit.Pixel})}`,
  ];
}

export function useDataTableStylesheet(
  totalHeight: number,
  offsetY: number,
): DataTableStyleAttributes {
  const ownerId = useId();
  const attributes = useMemo<DataTableStyleAttributes>(
    () => ({
      body: { [DataTableStyleAttribute.Body]: ownerId },
      row: { [DataTableStyleAttribute.Row]: ownerId },
    }),
    [ownerId],
  );

  useEffect(() => {
    dataTableStylesheet.update(
      ownerId,
      dataTableRules(ownerId, { offsetY, totalHeight }),
    );
    return () => dataTableStylesheet.remove(ownerId);
  }, [offsetY, ownerId, totalHeight]);

  return attributes;
}

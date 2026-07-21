import { SOURCE_IDS, type SourceId } from "@shared/source";

export const DATA_SOURCE_IDS = SOURCE_IDS;

export type DataSourceId = SourceId;
export type RenderSourceId = Exclude<DataSourceId, "news">;

export const RENDER_SOURCE_IDS: readonly RenderSourceId[] =
  DATA_SOURCE_IDS.filter(
    (source): source is RenderSourceId => source !== "news",
  );

export function isDataSourceId(value: unknown): value is DataSourceId {
  return (
    typeof value === "string" &&
    DATA_SOURCE_IDS.some((source) => source === value)
  );
}

export function isRenderSourceId(value: unknown): value is RenderSourceId {
  return (
    typeof value === "string" &&
    RENDER_SOURCE_IDS.some((source) => source === value)
  );
}

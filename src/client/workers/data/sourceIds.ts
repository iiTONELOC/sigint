import { SOURCE_IDS, isSourceIdValue, type SourceId } from "@shared/source";
import { Domain } from "@shared/domain/identity";

export type RenderSourceId = Exclude<SourceId, Domain.News>;

export const RENDER_SOURCE_IDS: readonly RenderSourceId[] = SOURCE_IDS.filter(
  (source): source is RenderSourceId => source !== Domain.News,
);

export function isSourceId(value: unknown): value is SourceId {
  return isSourceIdValue(value);
}

export function isRenderSourceId(value: unknown): value is RenderSourceId {
  return isSourceIdValue(value) && value !== Domain.News;
}

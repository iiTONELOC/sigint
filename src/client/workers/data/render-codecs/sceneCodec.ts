import type { DatasetPatch } from "@/workers/data/datasetStore";
import type { RenderSourceId } from "@/workers/data/sourceIds";
import type { SceneSourcePatch } from "@/workers/render/sceneProtocol";
import { geographicToUnitVector } from "@/lib/geo/unitSphere";

export type GeographicEntity = Readonly<{
  id: string;
  lat: number;
  lon: number;
}>;

export type ScenePatchCodecOptions<
  TEntity extends GeographicEntity,
> = Readonly<{
  source: RenderSourceId;
  attributeStride: number;
  writeAttributes: (
    entity: TEntity,
    target: Float32Array<ArrayBuffer>,
    offset: number,
  ) => void;
  stringAttributeStride?: number;
  writeStringAttributes?: (
    entity: TEntity,
    target: Uint32Array<ArrayBuffer>,
    offset: number,
    intern: (value: string) => number,
  ) => void;
}>;

export type ScenePatchCodec<
  TEntity extends GeographicEntity,
> = Readonly<{
  encode: (patch: DatasetPatch<TEntity>) => SceneSourcePatch;
}>;

const MAX_HANDLE = 0xffff_ffff;

function validateAttributeStride(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("The attribute stride must be a nonnegative integer");
  }
}

export function createScenePatchCodec<
  TEntity extends GeographicEntity,
>(
  options: ScenePatchCodecOptions<TEntity>,
): ScenePatchCodec<TEntity> {
  validateAttributeStride(options.attributeStride);
  const stringAttributeStride = options.stringAttributeStride ?? 0;
  validateAttributeStride(stringAttributeStride);
  const handlesById = new Map<string, number>();
  let nextHandle = 1;
  const dictionary = new Map<string, number>();
  const dictionaryValues: string[] = [];

  const intern = (value: string): number => {
    if (value.length === 0) return 0;
    const current = dictionary.get(value);
    if (current !== undefined) return current;
    const index = dictionaryValues.length + 1;
    dictionary.set(value, index);
    dictionaryValues.push(value);
    return index;
  };

  const handleFor = (id: string): number => {
    const current = handlesById.get(id);
    if (current !== undefined) return current;
    if (nextHandle > MAX_HANDLE) {
      throw new Error("The scene handle range is full");
    }
    const handle = nextHandle;
    nextHandle += 1;
    handlesById.set(id, handle);
    return handle;
  };

  return {
    encode(patch): SceneSourcePatch {
      const count = patch.upserts.length;
      const handles = new Uint32Array(count);
      const ids = new Array<string>(count);
      const positions = new Float32Array(count * 2);
      const unitVectors = new Float32Array(count * 3);
      const attributes = new Float32Array(
        count * options.attributeStride,
      );
      const stringAttributes = new Uint32Array(
        count * stringAttributeStride,
      );
      const dictionaryStart =
        patch.kind === "rebase" ? 0 : dictionaryValues.length;
      let index = 0;

      for (const entity of patch.upserts) {
        handles[index] = handleFor(entity.id);
        ids[index] = entity.id;
        const positionOffset = index * 2;
        positions[positionOffset] = entity.lon;
        positions[positionOffset + 1] = entity.lat;
        const unit = geographicToUnitVector(entity.lat, entity.lon);
        const unitOffset = index * 3;
        unitVectors[unitOffset] = unit.x;
        unitVectors[unitOffset + 1] = unit.y;
        unitVectors[unitOffset + 2] = unit.z;
        options.writeAttributes(
          entity,
          attributes,
          index * options.attributeStride,
        );
        options.writeStringAttributes?.(
          entity,
          stringAttributes,
          index * stringAttributeStride,
          intern,
        );
        index += 1;
      }

      const deleted = patch.deletedIds.flatMap((id) => {
        const handle = handlesById.get(id);
        if (handle === undefined) return [];
        handlesById.delete(id);
        return [handle];
      });

      return {
        type: "sourcePatch",
        source: options.source,
        sourceVersion: patch.version,
        kind: patch.kind,
        handles,
        ids,
        positions,
        unitVectors,
        attributes,
        attributeStride: options.attributeStride,
        stringAttributes,
        stringAttributeStride,
        dictionaryStart,
        dictionaryValues:
          patch.kind === "rebase"
            ? dictionaryValues.slice()
            : dictionaryValues.slice(dictionaryStart),
        deletedHandles: new Uint32Array(deleted),
      };
    },
  };
}

import type {
  SceneDataCommand,
  SceneSourcePatch,
} from "@/workers/render/sceneProtocol";
import type { RenderSourceId } from "@/workers/data/sourceIds";

export type RenderScenePatch = Extract<
  SceneDataCommand,
  { type: "sourcePatch" }
>;

export type RenderSceneRecord = Readonly<{
  id: string;
  longitude: number;
  latitude: number;
  unitX: number;
  unitY: number;
  unitZ: number;
  attributes: readonly number[];
}>;

export type RenderSceneView = Readonly<{
  capacity: number;
  active: Uint8Array<ArrayBuffer>;
  ids: readonly (string | null)[];
  positions: Float32Array<ArrayBuffer>;
  unitVectors: Float32Array<ArrayBuffer>;
  attributes: Float32Array<ArrayBuffer>;
  attributeStride: number;
  stringAttributes: Uint32Array<ArrayBuffer>;
  stringAttributeStride: number;
  dictionary: readonly string[];
}>;

export type RenderSceneStore = Readonly<{
  apply: (patch: RenderScenePatch) => void;
  version: () => number;
  size: () => number;
  view: () => RenderSceneView;
  handleForId: (id: string) => number | null;
  read: (handle: number) => RenderSceneRecord | null;
}>;

type SceneStorage = {
  capacity: number;
  active: Uint8Array<ArrayBuffer>;
  ids: (string | null)[];
  positions: Float32Array<ArrayBuffer>;
  unitVectors: Float32Array<ArrayBuffer>;
  attributes: Float32Array<ArrayBuffer>;
  stringAttributes: Uint32Array<ArrayBuffer>;
};

function nextCapacity(current: number, required: number): number {
  if (required <= current) return current;
  const exponent = Math.ceil(Math.log2(required / 16));
  const capacity = 16 * 2 ** Math.max(0, exponent);
  return Math.max(current, capacity);
}

function createStorage(
  capacity: number,
  attributeStride: number,
  stringAttributeStride: number,
  previous?: SceneStorage,
): SceneStorage {
  const active = new Uint8Array(capacity);
  const positions = new Float32Array(capacity * 2);
  const unitVectors = new Float32Array(capacity * 3);
  const attributes = new Float32Array(capacity * attributeStride);
  const stringAttributes = new Uint32Array(
    capacity * stringAttributeStride,
  );
  if (previous) {
    active.set(previous.active);
    positions.set(previous.positions);
    unitVectors.set(previous.unitVectors);
    attributes.set(previous.attributes);
    stringAttributes.set(previous.stringAttributes);
  }
  return {
    capacity,
    active,
    ids: Array.from(
      { length: capacity },
      (_, index) => previous?.ids[index] ?? null,
    ),
    positions,
    unitVectors,
    attributes,
    stringAttributes,
  };
}

function maximumHandle(patch: SceneSourcePatch): number {
  let maximum = 0;
  for (const handle of patch.handles) {
    maximum = Math.max(maximum, handle);
  }
  for (const handle of patch.deletedHandles) {
    maximum = Math.max(maximum, handle);
  }
  return maximum;
}

export function createRenderSceneStore(
  source: RenderSourceId,
): RenderSceneStore {
  let sourceVersion = 0;
  let itemCount = 0;
  let attributeStride: number | null = null;
  let stringAttributeStride: number | null = null;
  let dictionary: string[] = [];
  const handlesById = new Map<string, number>();
  let storage = createStorage(0, 0, 0);

  const ensureCapacity = (required: number): void => {
    const capacity = nextCapacity(storage.capacity, required);
    if (capacity === storage.capacity) return;
    storage = createStorage(
      capacity,
      attributeStride ?? 0,
      stringAttributeStride ?? 0,
      storage,
    );
  };

  return {
    apply(patch): void {
      if (patch.source !== source) {
        throw new Error("The scene patch has an incorrect source");
      }
      if (patch.sourceVersion <= sourceVersion) {
        throw new Error("The scene source version must increase");
      }
      if (
        attributeStride !== null &&
        patch.attributeStride !== attributeStride
      ) {
        throw new Error("The scene attribute stride cannot change");
      }
      if (
        stringAttributeStride !== null &&
        patch.stringAttributeStride !== stringAttributeStride
      ) {
        throw new Error("The scene string attribute stride cannot change");
      }
      if (attributeStride === null) {
        attributeStride = patch.attributeStride;
        stringAttributeStride = patch.stringAttributeStride;
        storage = createStorage(
          storage.capacity,
          attributeStride,
          stringAttributeStride,
          storage,
        );
      }
      if (patch.kind === "rebase") dictionary = [];
      if (patch.dictionaryStart !== dictionary.length) {
        throw new Error("The scene dictionary sequence is invalid");
      }
      dictionary.push(...patch.dictionaryValues);

      ensureCapacity(maximumHandle(patch));
      if (patch.kind === "rebase") {
        storage.active.fill(0);
        storage.ids.fill(null);
        handlesById.clear();
        itemCount = 0;
      }

      for (const [patchIndex, handle] of patch.handles.entries()) {
        const index = handle - 1;
        if (storage.active[index] === 0) itemCount += 1;
        const previousId = storage.ids[index];
        if (previousId) handlesById.delete(previousId);
        const id = patch.ids[patchIndex] ?? null;
        storage.active[index] = 1;
        storage.ids[index] = id;
        if (id) handlesById.set(id, handle);

        const patchPositionOffset = patchIndex * 2;
        const positionOffset = index * 2;
        storage.positions[positionOffset] =
          patch.positions[patchPositionOffset] ?? 0;
        storage.positions[positionOffset + 1] =
          patch.positions[patchPositionOffset + 1] ?? 0;

        const patchUnitOffset = patchIndex * 3;
        const unitOffset = index * 3;
        storage.unitVectors[unitOffset] =
          patch.unitVectors[patchUnitOffset] ?? 0;
        storage.unitVectors[unitOffset + 1] =
          patch.unitVectors[patchUnitOffset + 1] ?? 0;
        storage.unitVectors[unitOffset + 2] =
          patch.unitVectors[patchUnitOffset + 2] ?? 0;

        const stride = attributeStride ?? 0;
        const patchAttributeOffset = patchIndex * stride;
        storage.attributes.set(
          patch.attributes.subarray(
            patchAttributeOffset,
            patchAttributeOffset + stride,
          ),
          index * stride,
        );
        const stringStride = stringAttributeStride ?? 0;
        const patchStringOffset = patchIndex * stringStride;
        storage.stringAttributes.set(
          patch.stringAttributes.subarray(
            patchStringOffset,
            patchStringOffset + stringStride,
          ),
          index * stringStride,
        );
      }

      for (const handle of patch.deletedHandles) {
        const index = handle - 1;
        if (storage.active[index] !== 1) continue;
        storage.active[index] = 0;
        const id = storage.ids[index];
        if (id) handlesById.delete(id);
        storage.ids[index] = null;
        itemCount -= 1;
      }

      sourceVersion = patch.sourceVersion;
    },

    version(): number {
      return sourceVersion;
    },

    size(): number {
      return itemCount;
    },

    view(): RenderSceneView {
      return {
        capacity: storage.capacity,
        active: storage.active,
        ids: storage.ids,
        positions: storage.positions,
        unitVectors: storage.unitVectors,
        attributes: storage.attributes,
        attributeStride: attributeStride ?? 0,
        stringAttributes: storage.stringAttributes,
        stringAttributeStride: stringAttributeStride ?? 0,
        dictionary,
      };
    },

    handleForId(id): number | null {
      return handlesById.get(id) ?? null;
    },

    read(handle): RenderSceneRecord | null {
      if (!Number.isSafeInteger(handle) || handle < 1) return null;
      const index = handle - 1;
      if (storage.active[index] !== 1) return null;
      const id = storage.ids[index];
      if (!id) return null;
      const positionOffset = index * 2;
      const unitOffset = index * 3;
      const stride = attributeStride ?? 0;
      return {
        id,
        longitude: storage.positions[positionOffset] ?? 0,
        latitude: storage.positions[positionOffset + 1] ?? 0,
        unitX: storage.unitVectors[unitOffset] ?? 0,
        unitY: storage.unitVectors[unitOffset + 1] ?? 0,
        unitZ: storage.unitVectors[unitOffset + 2] ?? 0,
        attributes: Array.from(
          storage.attributes.subarray(
            index * stride,
            index * stride + stride,
          ),
        ),
      };
    },
  };
}

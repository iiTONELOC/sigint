import { describe, expect, test } from "bun:test";
import { DatasetPatchKind } from "@/workers/data/datasetStore";
import {
  CycloneSceneBinding,
} from "@/workers/data/render-codecs/cycloneSceneBinding";
import { Category, CYCLONE_CATEGORY_METADATA } from "@shared/domain/cyclones";
import {
  CycloneSceneAttribute,
  CycloneSceneRole,
  cycloneForecastSceneId,
  cycloneModelPathSceneId,
  cyclonePastPointSceneId,
  cycloneWindRadiusSceneId,
  SceneGeometryKind,
} from "@shared/scene";
import {
  SceneDataCommandType,
  type SceneSourceCommandBody,
} from "@/workers/render/sceneProtocol";
import { testCycloneScenePoint } from "../_support/cyclone";

type SourcePatch = Extract<
  SceneSourceCommandBody,
  { type: SceneDataCommandType.SourcePatch }
>;

function cyclone() {
  return testCycloneScenePoint();
}

function roles(command: SourcePatch): number[] {
  const roles: number[] = [];
  for (let index = 0; index < command.handles.length; index += 1) {
    roles.push(
      command.attributes[
        index * command.attributeStride +
          CycloneSceneAttribute.Role
      ] ?? -1,
    );
  }
  return roles;
}

function publishedStorm() {
  const commands: SceneSourceCommandBody[] = [];
  const binding = new CycloneSceneBinding((command) => {
    commands.push(command);
  });
  const point = cyclone();
  binding.publish({
    kind: DatasetPatchKind.Rebase,
    version: 1,
    upserts: [point],
    deletedIds: [],
  });
  const command = commands[0];
  expect(command?.type).toBe(SceneDataCommandType.SourcePatch);
  return { command: command?.type === SceneDataCommandType.SourcePatch ? command : null, point };
}

describe("cyclone scene publication", () => {
  test("publishes each storm record with its scene id and role", () => {
    const { command, point } = publishedStorm();
    expect(command?.sceneIds).toEqual([
      point.id,
      cycloneForecastSceneId(point.data.stormId, 24),
      cyclonePastPointSceneId(point.id, 0),
      cyclonePastPointSceneId(point.id, 1),
      cycloneWindRadiusSceneId(
        point.id,
        CYCLONE_CATEGORY_METADATA[Category.TropicalStorm].minimumWindKt,
      ),
      cycloneModelPathSceneId(point.id, "OFCL"),
    ]);
    expect(command?.entityIds).toEqual(
      command?.sceneIds.map(() => point.id),
    );
    expect(command ? roles(command) : []).toEqual([
      CycloneSceneRole.Current,
      CycloneSceneRole.Forecast,
      CycloneSceneRole.PastPoint,
      CycloneSceneRole.PastPoint,
      CycloneSceneRole.WindRadius,
      CycloneSceneRole.ModelPath,
    ]);
  });

  test("publishes model geometry and past-fix wind and hour", () => {
    const { command } = publishedStorm();
    expect(Array.from(command?.geometryKinds ?? [])).toEqual([
      SceneGeometryKind.None,
      SceneGeometryKind.None,
      SceneGeometryKind.None,
      SceneGeometryKind.None,
      SceneGeometryKind.None,
      SceneGeometryKind.Polyline,
    ]);
    const attribute = (index: number, field: CycloneSceneAttribute) =>
      command?.attributes[index * command.attributeStride + field];
    expect([attribute(2, CycloneSceneAttribute.MaxWindKt), attribute(3, CycloneSceneAttribute.MaxWindKt)]).toEqual([50, 60]);
    expect([attribute(2, CycloneSceneAttribute.ForecastHour), attribute(3, CycloneSceneAttribute.ForecastHour)]).toEqual([-48, -24]);
  });

  test("deletes removed child records without a parallel rebase", () => {
    const commands: SceneSourceCommandBody[] = [];
    const binding = new CycloneSceneBinding((command) => {
      commands.push(command);
    });
    const point = cyclone();
    binding.publish({
      kind: DatasetPatchKind.Rebase,
      version: 1,
      upserts: [point],
      deletedIds: [],
    });
    binding.publish({
      kind: DatasetPatchKind.Patch,
      version: 2,
      upserts: [{
        ...point,
        data: {
          ...point.data,
          forecast: [],
          pastTrack: [],
          windRadii: undefined,
          models: [],
        },
      }],
      deletedIds: [],
    });

    const command = commands[1];
    expect(command?.type).toBe(SceneDataCommandType.SourcePatch);
    if (command?.type !== SceneDataCommandType.SourcePatch) return;
    expect(command.kind).toBe(DatasetPatchKind.Patch);
    expect(command.sceneIds).toEqual([point.id]);
    expect(Array.from(command.deletedHandles)).toHaveLength(5);
    expect(command.handles[0]).toBe(1);
  });
});

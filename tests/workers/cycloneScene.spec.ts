import { describe, expect, test } from "bun:test";
import { DatasetPatchKind } from "@/workers/data/datasetStore";
import {
  CycloneSceneBinding,
} from "@/workers/data/render-codecs/cycloneSceneBinding";
import {
  CycloneSceneAttribute,
  CycloneSceneRole,
  CycloneSceneSchema,
  CycloneWindThreshold,
  cycloneForecastPathSceneId,
  cycloneForecastSceneId,
  cycloneModelPathSceneId,
  cyclonePastPathSceneId,
  cycloneWindRadiusSceneId,
} from "@/workers/render/scene/cycloneSchema";
import {
  SceneDataCommandType,
  SceneGeometryKind,
  type SceneSourceCommandBody,
} from "@/workers/render/sceneProtocol";
import { testCycloneScenePoint } from "../_support/cyclone";

function cyclone() {
  return testCycloneScenePoint();
}

function roles(command: Extract<
  SceneSourceCommandBody,
  { type: SceneDataCommandType.SourcePatch }
>): number[] {
  const roles: number[] = [];
  for (let index = 0; index < command.handles.length; index += 1) {
    roles.push(
      command.attributes[
        index * CycloneSceneSchema.AttributeStride +
          CycloneSceneAttribute.Role
      ] ?? -1,
    );
  }
  return roles;
}

describe("cyclone scene publication", () => {
  test("projects one storm through the shared scene contract", () => {
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
    if (command?.type !== SceneDataCommandType.SourcePatch) return;
    expect(command.sceneIds).toEqual([
      point.id,
      cycloneForecastSceneId(point.data.stormId, 24),
      cycloneForecastPathSceneId(point.id),
      cyclonePastPathSceneId(point.id),
      cycloneWindRadiusSceneId(
        point.id,
        CycloneWindThreshold.Gale,
      ),
      cycloneModelPathSceneId(point.id, "OFCL"),
    ]);
    expect(command.entityIds).toEqual(
      command.sceneIds.map(() => point.id),
    );
    expect(roles(command)).toEqual([
      CycloneSceneRole.Current,
      CycloneSceneRole.Forecast,
      CycloneSceneRole.ForecastPath,
      CycloneSceneRole.PastPath,
      CycloneSceneRole.WindRadius,
      CycloneSceneRole.ModelPath,
    ]);
    expect(Array.from(command.geometryKinds)).toEqual([
      SceneGeometryKind.None,
      SceneGeometryKind.None,
      SceneGeometryKind.Polyline,
      SceneGeometryKind.Polyline,
      SceneGeometryKind.None,
      SceneGeometryKind.Polyline,
    ]);
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

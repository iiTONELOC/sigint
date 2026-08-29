import { Domain } from "@shared/domain/identity";
import { describe, expect, test } from "bun:test";
import { DatasetPatchKind } from "@/workers/data/datasetStore";
import type {
  RenderSelectionSnapshot,
} from "@/workers/render/protocol";
import {
  createSceneCommand,
  parseSceneDataCommand,
  parseSceneInterestCommand,
  SceneDataCommandType,
  SceneInterestCommandType,
  SceneProtocolVersion,
} from "@/workers/render/sceneProtocol";
import {
  SCENE_POSITION_COUNT,
  SceneGeometryKind,
} from "@shared/scene";

enum MalformedSceneCommandType {
  LegacyData = "data",
}

describe("scene data protocol", () => {
  test("accepts a versioned transferable source patch", () => {
    const command = createSceneCommand(
      {
        type: SceneDataCommandType.SourcePatch,
        source: Domain.Aircraft,
        sourceVersion: 1,
        kind: DatasetPatchKind.Rebase,
        handles: new Uint32Array([1]),
        sceneIds: ["A1"],
        entityIds: ["A1"],
        positions: new Float64Array([10, 20]),
        motionPositions: new Float64Array([
          10.123456789012,
          20.123456789012,
        ]),
        motionPositionStride:
          SCENE_POSITION_COUNT,
        unitVectors: new Float32Array([1, 0, 0]),
        timestamps: new Float64Array([1_000]),
        attributes: new Float32Array([100, 90]),
        attributeStride: 2,
        stringAttributes: new Uint32Array(),
        stringAttributeStride: 0,
        dictionaryStart: 0,
        dictionaryValues: [],
        geometryKinds: new Uint8Array([SceneGeometryKind.Polygon]),
        geometryCoordinates: new Float64Array([
          0, 0, 10, 0, 10, 10, 0, 10, 0, 0,
          2, 2, 2, 4, 4, 4, 4, 2, 2, 2,
        ]),
        geometryPartEnds: new Uint32Array([5, 10]),
        geometryGroupEnds: new Uint32Array([2]),
        geometryRecordEnds: new Uint32Array([1]),
        deletedHandles: new Uint32Array(),
      },
      "session-1",
      1,
    );

    expect(parseSceneDataCommand(command)).toEqual(command);
  });

  test("rejects malformed motion-position and numeric lanes", () => {
    const command = createSceneCommand(
      {
        type: SceneDataCommandType.SourcePatch,
        source: Domain.Aircraft,
        sourceVersion: 1,
        kind: DatasetPatchKind.Rebase,
        handles: new Uint32Array([1]),
        sceneIds: ["A1"],
        entityIds: ["A1"],
        positions: new Float64Array([10, 20]),
        motionPositions: new Float64Array([10, 20]),
        motionPositionStride:
          SCENE_POSITION_COUNT,
        unitVectors: new Float32Array([1, 0, 0]),
        timestamps: new Float64Array([1_000]),
        attributes: new Float32Array([90]),
        attributeStride: 1,
        stringAttributes: new Uint32Array(),
        stringAttributeStride: 0,
        dictionaryStart: 0,
        dictionaryValues: [],
        geometryKinds: new Uint8Array([SceneGeometryKind.None]),
        geometryCoordinates: new Float64Array(),
        geometryPartEnds: new Uint32Array(),
        geometryGroupEnds: new Uint32Array(),
        geometryRecordEnds: new Uint32Array([0]),
        deletedHandles: new Uint32Array(),
      },
      "session-1",
      1,
    );

    expect(parseSceneDataCommand({
      ...command,
      motionPositionStride: 0,
    })).toBeNull();
    expect(parseSceneDataCommand({
      ...command,
      motionPositions: new Float64Array([
        Number.POSITIVE_INFINITY,
        20,
      ]),
    })).toBeNull();
    expect(parseSceneDataCommand({
      ...command,
      attributes: new Float32Array([Number.NaN]),
    })).toBeNull();
    expect(parseSceneDataCommand({
      ...command,
      unitVectors: new Float32Array([Number.NaN, 0, 0]),
    })).toBeNull();
  });

  test("rejects malformed buffers and legacy object arrays", () => {
    const malformed = createSceneCommand(
      {
        type: SceneDataCommandType.SourcePatch,
        source: Domain.Aircraft,
        sourceVersion: 1,
        kind: DatasetPatchKind.Rebase,
        handles: new Uint32Array([1]),
        sceneIds: ["A1"],
        entityIds: ["A1"],
        positions: new Float64Array(),
        motionPositions: new Float64Array(),
        motionPositionStride: 0,
        unitVectors: new Float32Array([1, 0, 0]),
        timestamps: new Float64Array([1_000]),
        attributes: new Float32Array(),
        attributeStride: 0,
        stringAttributes: new Uint32Array(),
        stringAttributeStride: 0,
        dictionaryStart: 0,
        dictionaryValues: [],
        geometryKinds: new Uint8Array([SceneGeometryKind.None]),
        geometryCoordinates: new Float64Array(),
        geometryPartEnds: new Uint32Array(),
        geometryGroupEnds: new Uint32Array(),
        geometryRecordEnds: new Uint32Array([0]),
        deletedHandles: new Uint32Array(),
      },
      "session-1",
      1,
    );

    expect(parseSceneDataCommand(malformed)).toBeNull();
    expect(
      parseSceneDataCommand({
        protocolVersion: SceneProtocolVersion.Current,
        sessionId: "session-1",
        sequence: 1,
        type: MalformedSceneCommandType.LegacyData,
        data: [],
      }),
    ).toBeNull();
  });

  test("rejects geometry with broken topology", () => {
    const command = createSceneCommand(
      {
        type: SceneDataCommandType.SourcePatch,
        source: Domain.Weather,
        sourceVersion: 1,
        kind: DatasetPatchKind.Rebase,
        handles: new Uint32Array([1]),
        sceneIds: ["weather-area"],
        entityIds: ["weather-area"],
        positions: new Float64Array([5, 5]),
        motionPositions: new Float64Array(),
        motionPositionStride: 0,
        unitVectors: new Float32Array([1, 0, 0]),
        timestamps: new Float64Array([1_000]),
        attributes: new Float32Array(),
        attributeStride: 0,
        stringAttributes: new Uint32Array(),
        stringAttributeStride: 0,
        dictionaryStart: 0,
        dictionaryValues: [],
        geometryKinds: new Uint8Array([SceneGeometryKind.Polygon]),
        geometryCoordinates: new Float64Array([
          0, 0, 10, 0, 10, 10, 0, 0,
        ]),
        geometryPartEnds: new Uint32Array([4]),
        geometryGroupEnds: new Uint32Array([2]),
        geometryRecordEnds: new Uint32Array([1]),
        deletedHandles: new Uint32Array(),
      },
      "session-1",
      1,
    );

    expect(parseSceneDataCommand(command)).toBeNull();
  });

  test("rejects an open geometry ring", () => {
    const command = createSceneCommand(
      {
        type: SceneDataCommandType.SourcePatch,
        source: Domain.Weather,
        sourceVersion: 1,
        kind: DatasetPatchKind.Rebase,
        handles: new Uint32Array([1]),
        sceneIds: ["weather-area"],
        entityIds: ["weather-area"],
        positions: new Float64Array([5, 5]),
        motionPositions: new Float64Array(),
        motionPositionStride: 0,
        unitVectors: new Float32Array([1, 0, 0]),
        timestamps: new Float64Array([1_000]),
        attributes: new Float32Array(),
        attributeStride: 0,
        stringAttributes: new Uint32Array(),
        stringAttributeStride: 0,
        dictionaryStart: 0,
        dictionaryValues: [],
        geometryKinds: new Uint8Array([SceneGeometryKind.Polygon]),
        geometryCoordinates: new Float64Array([
          0, 0, 10, 0, 10, 10, 0, 10, 1, 1,
        ]),
        geometryPartEnds: new Uint32Array([5]),
        geometryGroupEnds: new Uint32Array([1]),
        geometryRecordEnds: new Uint32Array([1]),
        deletedHandles: new Uint32Array(),
      },
      "session-1",
      1,
    );

    expect(parseSceneDataCommand(command)).toBeNull();
  });

  test("accepts an open polyline with two points", () => {
    const command = createSceneCommand(
      {
        type: SceneDataCommandType.SourcePatch,
        source: Domain.Cyclones,
        sourceVersion: 1,
        kind: DatasetPatchKind.Rebase,
        handles: new Uint32Array([1]),
        sceneIds: ["cyclone-path"],
        entityIds: ["cyclone"],
        positions: new Float64Array([-75, 25]),
        motionPositions: new Float64Array(),
        motionPositionStride: 0,
        unitVectors: new Float32Array([1, 0, 0]),
        timestamps: new Float64Array([1_000]),
        attributes: new Float32Array(),
        attributeStride: 0,
        stringAttributes: new Uint32Array(),
        stringAttributeStride: 0,
        dictionaryStart: 0,
        dictionaryValues: [],
        geometryKinds: new Uint8Array([SceneGeometryKind.Polyline]),
        geometryCoordinates: new Float64Array([
          -75, 25, -74, 26,
        ]),
        geometryPartEnds: new Uint32Array([2]),
        geometryGroupEnds: new Uint32Array([1]),
        geometryRecordEnds: new Uint32Array([1]),
        deletedHandles: new Uint32Array(),
      },
      "session-1",
      1,
    );

    expect(parseSceneDataCommand(command)).toEqual(command);
  });

  test("accepts unique source search handles", () => {
    const command = createSceneCommand(
      {
        type: SceneDataCommandType.SourceSearch,
        source: Domain.Earthquake,
        searchRevision: 1,
        active: true,
        handles: new Uint32Array([1, 3]),
      },
      "session-1",
      2,
    );

    expect(parseSceneDataCommand(command)).toEqual(command);
    expect(
      parseSceneDataCommand({
        ...command,
        handles: new Uint32Array([1, 1]),
      }),
    ).toBeNull();
  });

  test("accepts a selected track overlay", () => {
    const selection: RenderSelectionSnapshot = {
      revision: 2,
      identity: {
        source: Domain.Aircraft,
        entityId: "aircraft-a",
        interactionId: "aircraft-a",
        pointType: Domain.Aircraft,
      },
    };
    const command = createSceneCommand(
      {
        type: SceneDataCommandType.SelectionOverlay,
        selection,
        trail: [{
          lat: 40,
          lon: -74,
          ts: 100,
        }],
        route: [
          [40.6, -73.7],
          [33.9, -118.4],
        ],
      },
      "session-1",
      3,
    );

    expect(parseSceneDataCommand(command)).toEqual(command);
  });

  test("rejects the deleted selected-only motion field", () => {
    const command = createSceneCommand(
      {
        type: SceneDataCommandType.SelectionOverlay,
        selection: {
          revision: 2,
          identity: {
            source: Domain.Aircraft,
            entityId: "aircraft-a",
            interactionId: "aircraft-a",
            pointType: Domain.Aircraft,
          },
        },
        trail: [],
        route: null,
      },
      "session-1",
      3,
    );

    expect(parseSceneDataCommand({
      ...command,
      motion: {
        lat: 40,
        lon: -74,
        ts: 100,
        headingDeg: 90,
        speedMps: 200,
      },
    })).toBeNull();
  });

  test("rejects track data for a non-track selection", () => {
    const command = createSceneCommand(
      {
        type: SceneDataCommandType.SelectionOverlay,
        selection: {
          revision: 2,
          identity: {
            source: Domain.Events,
            entityId: "event-a",
            interactionId: "event-a",
            pointType: Domain.Events,
          },
        },
        trail: [{
          lat: 40,
          lon: -74,
          ts: 100,
        }],
        route: null,
      },
      "session-1",
      3,
    );

    expect(parseSceneDataCommand(command)).toBeNull();
  });

  test("rejects an aircraft route for another source", () => {
    const command = createSceneCommand(
      {
        type: SceneDataCommandType.SelectionOverlay,
        selection: {
          revision: 2,
          identity: {
            source: Domain.Ships,
            entityId: "ship-a",
            interactionId: "ship-a",
            pointType: Domain.Ships,
          },
        },
        trail: [],
        route: [
          [40.6, -73.7],
          [33.9, -118.4],
        ],
      },
      "session-1",
      3,
    );

    expect(parseSceneDataCommand(command)).toBeNull();
  });

  test("accepts a selection interest command", () => {
    const command = createSceneCommand(
      {
        type: SceneInterestCommandType.Selection,
        selection: {
          revision: 2,
          identity: null,
        },
      },
      "session-1",
      1,
    );

    expect(command.type).toBe(SceneInterestCommandType.Selection);
    expect(parseSceneInterestCommand(command)).toEqual(command);
  });

  test("accepts a search interest command", () => {
    const command = createSceneCommand(
      {
        type: SceneInterestCommandType.Search,
        search: {
          revision: 3,
          text: "EAGLE",
        },
      },
      "session-1",
      1,
    );

    expect(command.type).toBe(SceneInterestCommandType.Search);
    expect(parseSceneInterestCommand(command)).toEqual(command);
  });
});

import { describe, expect, test } from "bun:test";
import {
  RenderDataCommandType,
  RenderDataProtocolVersion,
  createRenderDataCommand,
  parseRenderDataCommand,
  RenderDataProtocolState,
} from "@/workers/render/dataChannel";
import { Domain } from "@shared/domain/identity";

describe("render data channel", () => {
  test("creates and parses the canonical bind command", () => {
    const command = createRenderDataCommand(
      { type: RenderDataCommandType.Bind },
      "session-a",
      1,
    );

    expect(command).toEqual({
      type: RenderDataCommandType.Bind,
      protocolVersion: RenderDataProtocolVersion.Current,
      sessionId: "session-a",
      sequence: 1,
    });
    expect(parseRenderDataCommand(command)).toEqual(command);
  });

  test("validates a complete packed earthquake rebase", () => {
    const command = createRenderDataCommand(
      {
        type: RenderDataCommandType.EarthquakeRebase,
        ids: ["Qone", "Qtwo"],
        positions: new Float64Array([-122, 47, 10, -20]),
        unitVectors: new Float32Array([1, 0, 0, 0, 1, 0]),
        magnitudes: new Float32Array([2.5, 5]),
        timestamps: new Float64Array([1_000, 2_000]),
      },
      "session-a",
      2,
    );

    expect(parseRenderDataCommand(command)).toEqual(command);
    expect(
      parseRenderDataCommand({
        ...command,
        positions: new Float64Array([-122, 47]),
      }),
    ).toBeNull();
  });

  test("validates a worker-owned earthquake search filter", () => {
    const command = createRenderDataCommand(
      {
        type: RenderDataCommandType.EarthquakeSearch,
        matchingIds: ["Qone", "Qtwo"],
      },
      "session-a",
      3,
    );
    expect(parseRenderDataCommand(command)).toEqual(command);
    expect(
      parseRenderDataCommand({ ...command, matchingIds: ["Qone", 2] }),
    ).toBeNull();
  });

  test("validates a complete packed fire rebase", () => {
    const command = createRenderDataCommand(
      {
        type: RenderDataCommandType.FireRebase,
        ids: ["Fone", "Ftwo"],
        positions: new Float64Array([-122, 47, 10, -20]),
        unitVectors: new Float32Array([1, 0, 0, 0, 1, 0]),
        frp: new Float32Array([12, 35]),
        timestamps: new Float64Array([1_000, 2_000]),
        confidences: new Uint8Array([1, 2]),
      },
      "session-a",
      4,
    );

    expect(parseRenderDataCommand(command)).toEqual(command);
    expect(
      parseRenderDataCommand({
        ...command,
        confidences: new Uint8Array([2]),
      }),
    ).toBeNull();
  });

  test("validates a worker-owned fire search filter", () => {
    const command = createRenderDataCommand(
      {
        type: RenderDataCommandType.FireSearch,
        matchingIds: ["Fone", "Ftwo"],
      },
      "session-a",
      5,
    );
    expect(parseRenderDataCommand(command)).toEqual(command);
  });

  test("rejects malformed envelopes", () => {
    expect(
      parseRenderDataCommand({
        type: RenderDataCommandType.Bind,
        protocolVersion: RenderDataProtocolVersion.Current + 1,
        sessionId: "session-a",
        sequence: 1,
      }),
    ).toBeNull();
    expect(
      parseRenderDataCommand({
        type: RenderDataCommandType.Bind,
        protocolVersion: RenderDataProtocolVersion.Current,
        sessionId: "",
        sequence: 1,
      }),
    ).toBeNull();
    expect(
      parseRenderDataCommand({
        type: RenderDataCommandType.Bind,
        protocolVersion: RenderDataProtocolVersion.Current,
        sessionId: "session-a",
        sequence: 0,
      }),
    ).toBeNull();
  });

  test("accepts only increasing commands for the bound session", () => {
    const state = new RenderDataProtocolState("session-a");
    const first = createRenderDataCommand(
      { type: RenderDataCommandType.Bind },
      "session-a",
      1,
    );

    expect(state.accept(first)).toBe(true);
    expect(state.accept(first)).toBe(false);
    expect(
      state.accept(
        createRenderDataCommand(
          { type: RenderDataCommandType.Bind },
          "session-b",
          2,
        ),
      ),
    ).toBe(false);
    expect(state.lastSequence()).toBe(1);
  });

  test("rejects events on the legacy object-array path", () => {
    expect(
      parseRenderDataCommand({
        type: RenderDataCommandType.PointsRebase,
        protocolVersion: RenderDataProtocolVersion.Current,
        sessionId: "session-a",
        sequence: 1,
        source: Domain.Events,
        points: [
          {
            id: "event-a",
            type: Domain.Events,
            lat: 10,
            lon: 20,
            data: {},
          },
        ],
      }),
    ).toBeNull();
  });
});

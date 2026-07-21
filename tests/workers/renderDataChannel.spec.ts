import { describe, expect, test } from "bun:test";
import {
  RENDER_DATA_PROTOCOL_VERSION,
  acceptRenderDataCommand,
  createRenderDataCommand,
  parseRenderDataCommand,
  type RenderDataProtocolState,
} from "@/workers/render/dataChannel";

describe("render data channel", () => {
  test("creates and parses the canonical bind command", () => {
    const command = createRenderDataCommand(
      { type: "bind" },
      "session-a",
      1,
    );

    expect(command).toEqual({
      type: "bind",
      protocolVersion: RENDER_DATA_PROTOCOL_VERSION,
      sessionId: "session-a",
      sequence: 1,
    });
    expect(parseRenderDataCommand(command)).toEqual(command);
  });

  test("validates a complete packed earthquake rebase", () => {
    const command = createRenderDataCommand(
      {
        type: "earthquakeRebase",
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
      { type: "earthquakeSearch", matchingIds: ["Qone", "Qtwo"] },
      "session-a",
      3,
    );
    expect(parseRenderDataCommand(command)).toEqual(command);
    expect(
      parseRenderDataCommand({ ...command, matchingIds: ["Qone", 2] }),
    ).toBeNull();
  });

  test("rejects malformed envelopes", () => {
    expect(
      parseRenderDataCommand({
        type: "bind",
        protocolVersion: RENDER_DATA_PROTOCOL_VERSION + 1,
        sessionId: "session-a",
        sequence: 1,
      }),
    ).toBeNull();
    expect(
      parseRenderDataCommand({
        type: "bind",
        protocolVersion: RENDER_DATA_PROTOCOL_VERSION,
        sessionId: "",
        sequence: 1,
      }),
    ).toBeNull();
    expect(
      parseRenderDataCommand({
        type: "bind",
        protocolVersion: RENDER_DATA_PROTOCOL_VERSION,
        sessionId: "session-a",
        sequence: 0,
      }),
    ).toBeNull();
  });

  test("accepts only increasing commands for the bound session", () => {
    const state: RenderDataProtocolState = {
      sessionId: "session-a",
      sequence: 0,
    };
    const first = createRenderDataCommand(
      { type: "bind" },
      "session-a",
      1,
    );

    expect(acceptRenderDataCommand(state, first)).toBe(true);
    expect(acceptRenderDataCommand(state, first)).toBe(false);
    expect(
      acceptRenderDataCommand(
        state,
        createRenderDataCommand({ type: "bind" }, "session-b", 2),
      ),
    ).toBe(false);
    expect(state).toEqual({ sessionId: "session-a", sequence: 1 });
  });
});

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

import { describe, expect, test } from "bun:test";
import {
  RENDER_PROTOCOL_VERSION,
  acceptRenderHeader,
  createRenderCommand,
  type RenderProtocolHeader,
  type RenderProtocolState,
} from "@/workers/render/protocol";

function header(
  overrides: Partial<RenderProtocolHeader> = {},
): RenderProtocolHeader {
  return {
    protocolVersion: RENDER_PROTOCOL_VERSION,
    sessionId: "session-a",
    sequence: 1,
    startsSession: false,
    ...overrides,
  };
}

describe("render worker protocol", () => {
  test("creates commands from the canonical versioned envelope", () => {
    expect(createRenderCommand({ type: "dispose" }, "session-a", 7)).toEqual({
      type: "dispose",
      protocolVersion: RENDER_PROTOCOL_VERSION,
      sessionId: "session-a",
      sequence: 7,
    });
  });

  test("accepts only the active session's increasing sequence", () => {
    const state: RenderProtocolState = {
      sessionId: null,
      sequence: 0,
    };

    expect(
      acceptRenderHeader(state, header({ startsSession: true })),
    ).toBe(true);
    expect(state).toEqual({ sessionId: "session-a", sequence: 1 });

    expect(acceptRenderHeader(state, header())).toBe(false);
    expect(
      acceptRenderHeader(state, header({ sequence: 2 })),
    ).toBe(true);
    expect(
      acceptRenderHeader(
        state,
        header({ sessionId: "session-b", sequence: 3 }),
      ),
    ).toBe(false);
    expect(state).toEqual({ sessionId: "session-a", sequence: 2 });
  });

  test("rejects wrong versions and permits an explicit new session", () => {
    const state: RenderProtocolState = {
      sessionId: "session-a",
      sequence: 4,
    };

    expect(
      acceptRenderHeader(
        state,
        header({ protocolVersion: RENDER_PROTOCOL_VERSION + 1, sequence: 5 }),
      ),
    ).toBe(false);
    expect(
      acceptRenderHeader(
        state,
        header({ sessionId: "session-b", sequence: 1, startsSession: true }),
      ),
    ).toBe(true);
    expect(state).toEqual({ sessionId: "session-b", sequence: 1 });
  });
});

import { describe, expect, test } from "bun:test";
import {
  acceptCorrelationDataCommand,
  createCorrelationDataCommand,
  parseCorrelationDataCommand,
  type CorrelationDataProtocolState,
} from "@/workers/correlation/dataChannel";

describe("correlation data channel", () => {
  test("validates a complete fire rebase", () => {
    const command = createCorrelationDataCommand(
      {
        type: "fireRebase",
        points: [
          {
            id: "FI:test",
            type: "fires",
            lat: 30,
            lon: -80,
            timestamp: "2026-07-21T12:00:00.000Z",
            data: { frp: 50, confidence: "high" },
          },
        ],
      },
      "correlation-session",
      2,
    );
    expect(parseCorrelationDataCommand(command)).toEqual(command);
  });

  test("accepts only increasing commands for its session", () => {
    const state: CorrelationDataProtocolState = {
      sessionId: "correlation-session",
      sequence: 0,
    };
    const command = createCorrelationDataCommand(
      { type: "bind" },
      "correlation-session",
      1,
    );
    expect(acceptCorrelationDataCommand(state, command)).toBe(true);
    expect(acceptCorrelationDataCommand(state, command)).toBe(false);
  });
});

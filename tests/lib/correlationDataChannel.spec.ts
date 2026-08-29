import { Domain } from "@shared/domain/identity";
import { describe, expect, test } from "bun:test";
import {
  CorrelationDataCommandType,
  CorrelationDataProtocolVersion,
  createCorrelationDataCommand,
  parseCorrelationDataCommand,
} from "@/workers/correlation/dataChannel";
import { SessionSequenceState } from "@/workers/render/sceneProtocol";

describe("correlation data channel", () => {
  test("validates a complete source rebase", () => {
    const command = createCorrelationDataCommand(
      {
        type: CorrelationDataCommandType.SourceRebase,
        source: Domain.Fire,
        points: [
          {
            id: "FI:test",
            type: Domain.Fires,
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

  test("rejects a rebase whose points do not match its source", () => {
    const command = createCorrelationDataCommand(
      {
        type: CorrelationDataCommandType.SourceRebase,
        source: Domain.Ships,
        points: [
          {
            id: "FI:test",
            type: Domain.Fires,
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
    expect(parseCorrelationDataCommand(command)).toBeNull();
  });

  test("rejects an unknown source", () => {
    expect(
      parseCorrelationDataCommand({
        protocolVersion: CorrelationDataProtocolVersion.Current,
        sessionId: "correlation-session",
        sequence: 2,
        type: CorrelationDataCommandType.SourceRebase,
        source: "mystery",
        points: [],
      }),
    ).toBeNull();
  });

  test("accepts only increasing commands for its session", () => {
    const state = new SessionSequenceState("correlation-session");
    const command = createCorrelationDataCommand(
      { type: CorrelationDataCommandType.Bind },
      "correlation-session",
      1,
    );
    expect(state.accept(command)).toBe(true);
    expect(state.accept(command)).toBe(false);
  });
});

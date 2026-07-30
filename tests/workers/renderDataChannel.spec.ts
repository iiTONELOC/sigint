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

  test("accepts only cyclones on the legacy object-array path", () => {
    for (const source of [
      Domain.Events,
      Domain.Weather,
      Domain.CycloneWarnings,
    ]) {
      expect(
        parseRenderDataCommand({
          type: RenderDataCommandType.PointsRebase,
          protocolVersion: RenderDataProtocolVersion.Current,
          sessionId: "session-a",
          sequence: 1,
          source,
          points: [
            {
              id: "migrated-record",
              type: Domain.Events,
              lat: 10,
              lon: 20,
              data: {},
            },
          ],
        }),
      ).toBeNull();
    }

    const command = {
      type: RenderDataCommandType.PointsRebase,
      protocolVersion: RenderDataProtocolVersion.Current,
      sessionId: "session-a",
      sequence: 1,
      source: Domain.Cyclones,
      points: [
        {
          id: "cyclone-a",
          type: Domain.Cyclones,
          lat: 10,
          lon: 20,
          data: {},
        },
      ],
    };
    const parsed = parseRenderDataCommand(command);
    expect(parsed?.type).toBe(RenderDataCommandType.PointsRebase);
    if (parsed?.type !== RenderDataCommandType.PointsRebase) {
      return;
    }
    expect(parsed.source).toBe(Domain.Cyclones);
    expect(parsed.points).toHaveLength(1);
  });
});

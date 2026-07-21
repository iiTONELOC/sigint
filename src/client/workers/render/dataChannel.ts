import { isRecord } from "@shared/geo";

export const RENDER_DATA_PROTOCOL_VERSION: 1 = 1;

type RenderDataEnvelope = Readonly<{
  protocolVersion: typeof RENDER_DATA_PROTOCOL_VERSION;
  sessionId: string;
  sequence: number;
}>;

export type RenderDataCommandBody = Readonly<{ type: "bind" }>;

export type RenderDataCommand = RenderDataCommandBody & RenderDataEnvelope;

export type RenderDataProtocolState = {
  sessionId: string;
  sequence: number;
};

export function createRenderDataCommand(
  body: RenderDataCommandBody,
  sessionId: string,
  sequence: number,
): RenderDataCommand {
  return {
    ...body,
    protocolVersion: RENDER_DATA_PROTOCOL_VERSION,
    sessionId,
    sequence,
  };
}

export function parseRenderDataCommand(
  value: unknown,
): RenderDataCommand | null {
  if (
    !isRecord(value) ||
    value.type !== "bind" ||
    value.protocolVersion !== RENDER_DATA_PROTOCOL_VERSION ||
    typeof value.sessionId !== "string" ||
    value.sessionId.length === 0 ||
    typeof value.sequence !== "number" ||
    !Number.isSafeInteger(value.sequence) ||
    value.sequence < 1
  ) {
    return null;
  }
  return {
    type: "bind",
    protocolVersion: RENDER_DATA_PROTOCOL_VERSION,
    sessionId: value.sessionId,
    sequence: value.sequence,
  };
}

export function acceptRenderDataCommand(
  state: RenderDataProtocolState,
  command: RenderDataCommand,
): boolean {
  if (
    command.sessionId !== state.sessionId ||
    command.sequence <= state.sequence
  ) {
    return false;
  }
  state.sequence = command.sequence;
  return true;
}

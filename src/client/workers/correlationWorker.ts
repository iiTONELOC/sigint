import { computeCorrelations } from "@/lib/correlation";
import type { DataPoint } from "@/features/base/dataPoints";
import type { QueryableSourceId } from "@/workers/data/queryableSources";
import {
  CorrelationDataCommandType,
  parseCorrelationDataCommand,
} from "@/workers/correlation/dataChannel";
import { SessionSequenceState } from "@/workers/render/sceneProtocol";
import {
  CorrelationWorkerMessageType,
  type CorrelationWorkerCommand,
  type CorrelationWorkerResponse,
} from "@/workers/correlation/protocol";

const pointsBySource = new Map<QueryableSourceId, readonly DataPoint[]>();
let dataPort: MessagePort | null = null;

function bindDataPort(port: MessagePort, sessionId: string): void {
  dataPort?.close();
  dataPort = port;
  const state = new SessionSequenceState(sessionId);
  port.onmessage = (event: MessageEvent<unknown>) => {
    const command = parseCorrelationDataCommand(event.data);
    if (!command || !state.accept(command)) return;
    if (command.type === CorrelationDataCommandType.SourceRebase) {
      pointsBySource.set(command.source, command.points);
    }
  };
  port.start();
}

function allPoints(): DataPoint[] {
  const points: DataPoint[] = [];
  for (const sourcePoints of pointsBySource.values()) {
    for (const point of sourcePoints) points.push(point);
  }
  return points;
}

globalThis.onmessage = (event: MessageEvent<CorrelationWorkerCommand>) => {
  const message = event.data;
  if (message.type === CorrelationWorkerMessageType.BindData) {
    bindDataPort(message.port, message.correlationSessionId);
    return;
  }
  const response: CorrelationWorkerResponse = {
    type: CorrelationWorkerMessageType.Result,
    requestId: message.requestId,
    result: computeCorrelations(
      allPoints(),
      message.news,
      message.baseline,
    ),
  };
  globalThis.postMessage(response);
};

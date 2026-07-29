import { computeCorrelations } from "@/lib/correlation";
import type { DataPoint } from "@/features/base/dataPoints";
import type { NewsArticle } from "@/features/news";
import type {
  CorrelationResult,
  RegionBaseline,
} from "@/lib/correlation";
import type { QueryableSourceId } from "@/workers/data/queryableSources";
import {
  acceptCorrelationDataCommand,
  parseCorrelationDataCommand,
  type CorrelationDataProtocolState,
} from "@/workers/correlation/dataChannel";

/**
 * Records reach this worker from the DataWorker, never from React. The main
 * thread only sends news, which is not a DataWorker source, and the baseline.
 */
type ComputeRequest = Readonly<{
  type: "compute";
  requestId: number;
  news: NewsArticle[];
  baseline: RegionBaseline;
}>;

type BindDataRequest = Readonly<{
  type: "bindData";
  port: MessagePort;
  correlationSessionId: string;
}>;

type WorkerRequest = ComputeRequest | BindDataRequest;

type ComputeResponse = Readonly<{
  type: "result";
  requestId: number;
  result: CorrelationResult;
}>;

const pointsBySource = new Map<QueryableSourceId, readonly DataPoint[]>();
let dataPort: MessagePort | null = null;

function bindDataPort(port: MessagePort, sessionId: string): void {
  dataPort?.close();
  dataPort = port;
  const state: CorrelationDataProtocolState = {
    sessionId,
    sequence: 0,
  };
  port.onmessage = (event: MessageEvent<unknown>) => {
    const command = parseCorrelationDataCommand(event.data);
    if (!command || !acceptCorrelationDataCommand(state, command)) return;
    if (command.type === "sourceRebase") {
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

globalThis.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === "bindData") {
    bindDataPort(message.port, message.correlationSessionId);
    return;
  }
  const response: ComputeResponse = {
    type: "result",
    requestId: message.requestId,
    result: computeCorrelations(
      allPoints(),
      message.news,
      message.baseline,
    ),
  };
  globalThis.postMessage(response);
};

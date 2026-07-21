import { computeCorrelations } from "@/lib/correlation";
import type { DataPoint } from "@/features/base/dataPoints";
import type { FirePoint } from "@/features/environmental/fires/data/source";
import type { NewsArticle } from "@/features/news";
import type {
  CorrelationResult,
  RegionBaseline,
} from "@/lib/correlation";
import {
  acceptCorrelationDataCommand,
  parseCorrelationDataCommand,
  type CorrelationDataProtocolState,
} from "@/workers/correlation/dataChannel";

type ComputeRequest = Readonly<{
  type: "compute";
  requestId: number;
  allData: DataPoint[];
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

let firePoints: readonly FirePoint[] = [];
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
    if (command.type === "fireRebase") firePoints = command.points;
  };
  port.start();
}

globalThis.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === "bindData") {
    bindDataPort(message.port, message.correlationSessionId);
    return;
  }
  const allData = [...message.allData, ...firePoints];
  const response: ComputeResponse = {
    type: "result",
    requestId: message.requestId,
    result: computeCorrelations(
      allData,
      message.news,
      message.baseline,
    ),
  };
  globalThis.postMessage(response);
};

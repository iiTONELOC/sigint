import type { NewsArticle } from "@/features/news";
import type {
  CorrelationResult,
  RegionBaseline,
} from "@/lib/correlation";

export enum CorrelationWorkerMessageType {
  Compute = "compute",
  BindData = "bindData",
  Result = "result",
}

export enum CorrelationWorkerLocation {
  Script = "/workers/correlationWorker.js",
}

export type CorrelationComputeCommand = Readonly<{
  type: CorrelationWorkerMessageType.Compute;
  requestId: number;
  news: NewsArticle[];
  baseline: RegionBaseline;
}>;

export type CorrelationBindDataCommand = Readonly<{
  type: CorrelationWorkerMessageType.BindData;
  port: MessagePort;
  correlationSessionId: string;
}>;

export type CorrelationWorkerCommand =
  | CorrelationComputeCommand
  | CorrelationBindDataCommand;

export type CorrelationWorkerResponse = Readonly<{
  type: CorrelationWorkerMessageType.Result;
  requestId: number;
  result: CorrelationResult;
}>;

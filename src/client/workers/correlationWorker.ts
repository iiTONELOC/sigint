import { computeCorrelations } from "@/lib/correlation";
import type { DataPoint } from "@/features/base/dataPoints";
import type { NewsArticle } from "@/features/news";
import type { CorrelationResult, RegionBaseline } from "@/lib/correlation";

type ComputeRequest = {
  type: "compute";
  requestId: number;
  allData: DataPoint[];
  news: NewsArticle[];
  baseline: RegionBaseline;
};

type ComputeResponse = {
  type: "result";
  requestId: number;
  result: CorrelationResult;
};

self.onmessage = (e: MessageEvent<ComputeRequest>) => {
  const msg = e.data;
  if (msg?.type !== "compute") return;
  const result = computeCorrelations(msg.allData, msg.news, msg.baseline);
  const response: ComputeResponse = {
    type: "result",
    requestId: msg.requestId,
    result,
  };
  (self as unknown as Worker).postMessage(response);
};

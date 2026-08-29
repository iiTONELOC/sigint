import {
  SourceFetchFailure,
  type SourceFailureMessages,
  type SourceTransport,
} from "@/workers/data/source-model/remoteSource";
import { Domain } from "@shared/domain/identity";
import {
  HttpHeader,
  HttpMediaType,
  HttpUserAgent,
} from "@shared/http";

enum FeedEndpoint {
  NwsAlerts = "https://api.weather.gov/alerts/active?status=actual&message_type=alert",
}

// NWS rejects cloud-provider addresses, so both readers of this feed run in
// the browser. A worker is still the browser; a server proxy would be blocked.
export const NWS_ALERTS_TRANSPORT: SourceTransport = {
  url: FeedEndpoint.NwsAlerts,
  headers: {
    [HttpHeader.UserAgent]: HttpUserAgent.SigintDashboard,
    [HttpHeader.Accept]: HttpMediaType.GeoJson,
  },
};

export const NWS_SOURCE_FAILURE_MESSAGES = {
  [Domain.Weather]: {
    [SourceFetchFailure.Request]: "The weather alerts request failed",
    [SourceFetchFailure.Payload]:
      "The weather alerts response was not NWS GeoJSON",
  },
  [Domain.CycloneWarnings]: {
    [SourceFetchFailure.Request]: "The tropical alerts request failed",
    [SourceFetchFailure.Payload]:
      "The tropical alerts response was not NWS GeoJSON",
  },
} satisfies Readonly<Record<string, SourceFailureMessages>>;

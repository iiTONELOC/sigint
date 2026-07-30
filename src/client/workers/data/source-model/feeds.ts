import {
  CLIENT_USER_AGENT,
  HttpHeader,
  MediaType,
  type SourceTransport,
} from "@/workers/data/source-model/remoteSource";

const NWS_ALERTS_URL =
  "https://api.weather.gov/alerts/active?status=actual&message_type=alert";

// NWS rejects cloud-provider addresses, so both readers of this feed run in
// the browser. A worker is still the browser; a server proxy would be blocked.
export const NWS_ALERTS_TRANSPORT: SourceTransport = {
  url: NWS_ALERTS_URL,
  headers: {
    [HttpHeader.UserAgent]: CLIENT_USER_AGENT,
    [HttpHeader.Accept]: MediaType.GeoJson,
  },
};

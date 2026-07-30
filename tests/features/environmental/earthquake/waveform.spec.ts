import { describe, expect, test } from "bun:test";
import {
  fetchWaveform,
  type WaveformFetcher,
} from "@/features/environmental/earthquake/data/waveform";

const EVENT_LATITUDE = 18.4511666666667;
const EVENT_LONGITUDE = -66.5866666666667;
const EVENT_TIME = "2026-07-20T22:38:34.030Z";

type StationFixture = Readonly<{
  network: string;
  station: string;
  location: string;
  channel: string;
  latitude: number;
  longitude: number;
}>;

function stationRow(station: StationFixture): string {
  return [
    station.network,
    station.station,
    station.location,
    station.channel,
    station.latitude,
    station.longitude,
    "",
  ].join("|");
}

function timeseries(station: string, channel: string): string {
  return [
    `TIMESERIES PR_${station}_00_${channel}_D, 3 samples, 40 sps, 2026-07-20T22:38:14, TSPAIR, INTEGER, COUNTS`,
    "2026-07-20T22:38:14.000000 -2",
    "2026-07-20T22:38:14.025000 0",
    "2026-07-20T22:38:14.050000 2",
  ].join("\n");
}

function availability(stations: string): string {
  const rows = stations.split("\n").map((row) => {
    const columns = row.split("|");
    const network = columns[0] ?? "";
    const station = columns[1] ?? "";
    const location = columns[2]?.trim() || "--";
    const channel = columns[3] ?? "";
    return `${network} ${station} ${location} ${channel} M 40.0 2026-07-20T22:38:14.000000Z 2026-07-20T22:42:14.000000Z`;
  });
  return [
    "#Network Station Location Channel Quality SampleRate Earliest Latest",
    ...rows,
  ].join("\n");
}

describe("earthquake waveform acquisition", () => {
  test("uses the direct EarthScope service and the nearest active station", async () => {
    const requests: string[] = [];
    const stations = [
      stationRow({
        network: "IU",
        station: "FAR",
        location: "00",
        channel: "BHZ",
        latitude: 18.1091,
        longitude: -66.15,
      }),
      stationRow({
        network: "PR",
        station: "NEAR",
        location: "00",
        channel: "HHZ",
        latitude: 18.477098,
        longitude: -66.529495,
      }),
    ].join("\n");
    const requestMethods: Array<string | undefined> = [];
    const fetcher: WaveformFetcher = async (url, init) => {
      requests.push(url);
      requestMethods.push(init?.method);
      const request = new URL(url);
      if (request.pathname.includes("/station/")) {
        return new Response(stations);
      }
      if (request.pathname.includes("/availability/")) {
        return new Response(availability(stations));
      }
      return new Response(timeseries("NEAR", "HHZ"));
    };

    const result = await fetchWaveform(
      EVENT_LATITUDE,
      EVENT_LONGITUDE,
      EVENT_TIME,
      { fetcher },
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.waveform.station).toBe("NEAR");
    expect(result.waveform.rawSamples).toEqual([-2, 0, 2]);

    const stationRequest = requests[0];
    const availabilityRequest = requests[1];
    const traceRequest = requests[2];
    expect(stationRequest).toBeDefined();
    expect(availabilityRequest).toBeDefined();
    expect(traceRequest).toBeDefined();
    if (!stationRequest || !availabilityRequest || !traceRequest) return;
    const stationUrl = new URL(stationRequest);
    const availabilityUrl = new URL(availabilityRequest);
    const traceUrl = new URL(traceRequest);
    expect(stationUrl.hostname).toBe("service.earthscope.org");
    expect(availabilityUrl.pathname).toContain("/availability/");
    expect(requestMethods[1]).toBe("POST");
    expect(stationUrl.searchParams.get("starttime")).toBe(
      "2026-07-20T22:38:14",
    );
    expect(stationUrl.searchParams.get("endtime")).toBe(
      "2026-07-20T22:42:14",
    );
    expect(traceUrl.searchParams.get("sta")).toBe("NEAR");
  });

  test("continues beyond failed traces without a candidate cap", async () => {
    const stations = [
      stationRow({
        network: "PR",
        station: "ONE",
        location: "00",
        channel: "BHZ",
        latitude: 18.45,
        longitude: -66.58,
      }),
      stationRow({
        network: "PR",
        station: "TWO",
        location: "00",
        channel: "HHZ",
        latitude: 18.45,
        longitude: -66.57,
      }),
      stationRow({
        network: "PR",
        station: "THREE",
        location: "00",
        channel: "EHZ",
        latitude: 18.45,
        longitude: -66.56,
      }),
    ].join("\n");
    let traceRequests = 0;
    const fetcher: WaveformFetcher = async (url) => {
      const request = new URL(url);
      if (request.pathname.includes("/station/")) {
        return new Response(stations);
      }
      if (request.pathname.includes("/availability/")) {
        return new Response(availability(stations));
      }
      traceRequests++;
      if (traceRequests < 3) return new Response(null, { status: 204 });
      return new Response(timeseries("THREE", "EHZ"));
    };

    const result = await fetchWaveform(
      EVENT_LATITUDE,
      EVENT_LONGITUDE,
      EVENT_TIME,
      { fetcher },
    );

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.waveform.station).toBe("THREE");
    expect(traceRequests).toBe(3);
  });

  test("does not probe traces without confirmed availability", async () => {
    const stations = stationRow({
      network: "GI",
      station: "SASJ",
      location: "",
      channel: "HHZ",
      latitude: 14.95,
      longitude: -91.8,
    });
    let availabilityRequests = 0;
    let traceRequests = 0;
    const fetcher: WaveformFetcher = async (url) => {
      const request = new URL(url);
      if (request.pathname.includes("/station/")) {
        return new Response(stations);
      }
      if (request.pathname.includes("/availability/")) {
        availabilityRequests++;
        return new Response(null, { status: 204 });
      }
      traceRequests++;
      return new Response(null, { status: 404 });
    };

    const result = await fetchWaveform(
      EVENT_LATITUDE,
      EVENT_LONGITUDE,
      EVENT_TIME,
      { fetcher },
    );

    expect(result).toEqual({
      status: "unavailable",
      reason: "no-recorded-trace",
    });
    expect(availabilityRequests).toBeGreaterThan(0);
    expect(traceRequests).toBe(0);
  });

  test("distinguishes service failure from an empty station search", async () => {
    const failedFetcher: WaveformFetcher = async () => {
      throw new Error("network unavailable");
    };
    const emptyFetcher: WaveformFetcher = async () =>
      new Response(null, { status: 204 });

    const failed = await fetchWaveform(
      EVENT_LATITUDE,
      EVENT_LONGITUDE,
      EVENT_TIME,
      { fetcher: failedFetcher },
    );
    const empty = await fetchWaveform(
      EVENT_LATITUDE,
      EVENT_LONGITUDE,
      EVENT_TIME,
      { fetcher: emptyFetcher },
    );

    expect(failed).toEqual({
      status: "unavailable",
      reason: "station-service-unavailable",
    });
    expect(empty).toEqual({
      status: "unavailable",
      reason: "no-active-station",
    });
  });
});

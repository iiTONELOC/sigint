import { describe, expect, test } from "bun:test";
import {
  fetchWaveform,
  type WaveformFetcher,
} from "@/features/environmental/earthquake/data/waveform";
import {
  WaveformStatus,
  WaveformUnavailableReason,
} from "@/features/environmental/earthquake/model";

enum WaveformFixtureCoordinate {
  Latitude = 18.4511666666667,
  Longitude = -66.5866666666667,
}

enum WaveformFixtureTime {
  Origin = "2026-07-20T22:38:34.030Z",
}

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
    const fetcher: WaveformFetcher = async (url) => {
      requests.push(url);
      const request = new URL(url);
      if (request.pathname.includes("/station/")) {
        return new Response(stations);
      }
      return new Response(timeseries("NEAR", "HHZ"));
    };

    const result = await fetchWaveform(
      WaveformFixtureCoordinate.Latitude,
      WaveformFixtureCoordinate.Longitude,
      WaveformFixtureTime.Origin,
      { fetcher },
    );

    expect(result.status).toBe(WaveformStatus.Ready);
    if (result.status !== WaveformStatus.Ready) return;
    expect(result.waveform.station).toBe("NEAR");
    expect(result.waveform.rawSamples).toEqual([-2, 0, 2]);

    const stationRequest = requests[0];
    const traceRequest = requests[1];
    expect(stationRequest).toBeDefined();
    expect(traceRequest).toBeDefined();
    if (!stationRequest || !traceRequest) return;
    const stationUrl = new URL(stationRequest);
    const traceUrl = new URL(traceRequest);
    expect(stationUrl.hostname).toBe("service.earthscope.org");
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
      traceRequests++;
      if (traceRequests < 3) return new Response(null, { status: 204 });
      return new Response(timeseries("THREE", "EHZ"));
    };

    const result = await fetchWaveform(
      WaveformFixtureCoordinate.Latitude,
      WaveformFixtureCoordinate.Longitude,
      WaveformFixtureTime.Origin,
      { fetcher },
    );

    expect(result.status).toBe(WaveformStatus.Ready);
    if (result.status !== WaveformStatus.Ready) return;
    expect(result.waveform.station).toBe("THREE");
    expect(traceRequests).toBe(3);
  });

  test("distinguishes service failure from an empty station search", async () => {
    const failedFetcher: WaveformFetcher = async () => {
      throw new Error("network unavailable");
    };
    const emptyFetcher: WaveformFetcher = async () =>
      new Response(null, { status: 204 });

    const failed = await fetchWaveform(
      WaveformFixtureCoordinate.Latitude,
      WaveformFixtureCoordinate.Longitude,
      WaveformFixtureTime.Origin,
      { fetcher: failedFetcher },
    );
    const empty = await fetchWaveform(
      WaveformFixtureCoordinate.Latitude,
      WaveformFixtureCoordinate.Longitude,
      WaveformFixtureTime.Origin,
      { fetcher: emptyFetcher },
    );

    expect(failed).toEqual({
      status: WaveformStatus.Unavailable,
      reason: WaveformUnavailableReason.StationService,
    });
    expect(empty).toEqual({
      status: WaveformStatus.Unavailable,
      reason: WaveformUnavailableReason.Station,
    });
  });
});

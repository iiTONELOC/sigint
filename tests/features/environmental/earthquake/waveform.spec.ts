import { describe, expect, test } from "bun:test";
import {
  fetchWaveform,
  type WaveformFetcher,
} from "@/features/environmental/earthquake/data/waveform";
import {
  WaveformStatus,
  WaveformUnavailableReason,
} from "@shared/domain/earthquakes";

enum WaveformFixtureCoordinate {
  Latitude = 18.4511666666667,
  Longitude = -66.5866666666667,
}

enum WaveformFixtureTime {
  Origin = "2026-07-20T22:38:34.030Z",
}

const MINISEED_FIXTURE = new URL(
  "./fixtures/anmo-bhz-2026-08-26.mseed",
  import.meta.url,
);

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

async function miniSeedResponse(): Promise<Response> {
  return new Response(await Bun.file(MINISEED_FIXTURE).arrayBuffer());
}

describe("earthquake waveform acquisition", () => {
  test("uses EarthScope station and dataselect services and the nearest active station", async () => {
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
      return miniSeedResponse();
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
    expect(result.waveform.sampleRate).toBe(40);
    expect(result.waveform.rawSamples).toHaveLength(2400);
    expect(result.waveform.samples).toHaveLength(600);

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
    expect(traceUrl.pathname).toBe("/fdsnws/dataselect/1/query");
    expect(traceUrl.searchParams.get("sta")).toBe("NEAR");
    expect(traceUrl.searchParams.get("endtime")).toBe("2026-07-20T22:42:14");
  });

  test("continues beyond empty and undecodable traces without a candidate cap", async () => {
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
      if (traceRequests === 1) return new Response(null, { status: 204 });
      if (traceRequests === 2) return new Response("not miniseed");
      return miniSeedResponse();
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

  test("reports no recorded trace when every channel answers 204", async () => {
    const stations = stationRow({
      network: "GI",
      station: "SASJ",
      location: "",
      channel: "HHZ",
      latitude: 14.95,
      longitude: -91.8,
    });
    let traceRequests = 0;
    const fetcher: WaveformFetcher = async (url) => {
      const request = new URL(url);
      if (request.pathname.includes("/station/")) {
        return new Response(stations);
      }
      traceRequests++;
      expect(request.searchParams.get("loc")).toBe("--");
      return new Response(null, { status: 204 });
    };

    const result = await fetchWaveform(
      WaveformFixtureCoordinate.Latitude,
      WaveformFixtureCoordinate.Longitude,
      WaveformFixtureTime.Origin,
      { fetcher },
    );

    expect(result).toEqual({
      status: WaveformStatus.Unavailable,
      reason: WaveformUnavailableReason.RecordedTrace,
    });
    expect(traceRequests).toBe(1);
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

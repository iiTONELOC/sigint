import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { VIDEO_CHANNELS_ROUTE } from "@shared/domain/videoChannel";

enum ChannelFixtureId {
  Live = "Live.us",
}

enum ChannelFixtureCount {
  One = 1,
  Two = 2,
  Zero = 0,
}

enum ChannelFixtureStatus {
  Unavailable = 503,
}

const CATALOG = {
  [ChannelFixtureId.Live]: {
    id: ChannelFixtureId.Live,
    name: "Live News",
    logo: null,
    url: "https://live.example/master.m3u8",
    country: "US",
    languages: ["eng"],
    featured: false,
  },
};

let mocking = true;
let requests: string[] = [];
let responses: Response[] = [];
const realAuth = { ...(await import("@/lib/net/authService")) };

mock.module("@/lib/net/authService", () => ({
  ...realAuth,
  authenticatedFetch: (url: string, init?: RequestInit): Promise<Response> => {
    if (!mocking) return realAuth.authenticatedFetch(url, init);
    requests.push(url);
    return Promise.resolve(responses.shift() ?? new Response(null, { status: ChannelFixtureStatus.Unavailable }));
  },
}));

const { __resetChannelCacheForTests, fetchNewsChannels } = await import("@/panes/video-feed/channelService");

afterAll(() => {
  mocking = false;
});

beforeEach(() => {
  __resetChannelCacheForTests();
  requests = [];
  responses = [];
});

describe("fetchNewsChannels", () => {
  test("loads the probed catalog from the server once", async () => {
    responses = [Response.json({ channels: CATALOG, probed: true })];

    const first = await fetchNewsChannels();
    const second = await fetchNewsChannels();

    expect(requests).toEqual([VIDEO_CHANNELS_ROUTE]);
    expect(Object.keys(first)).toEqual([ChannelFixtureId.Live]);
    expect(second).toBe(first);
  });

  test("asks again while the server has not probed yet", async () => {
    responses = [
      Response.json({ channels: CATALOG, probed: false }),
      Response.json({ channels: CATALOG, probed: true }),
    ];

    await fetchNewsChannels();
    await fetchNewsChannels();
    await fetchNewsChannels();

    expect(requests).toHaveLength(ChannelFixtureCount.Two);
  });

  test("returns an empty catalog when the route fails and asks again later", async () => {
    const empty = await fetchNewsChannels();
    responses = [Response.json({ channels: CATALOG, probed: true })];
    const retried = await fetchNewsChannels();

    expect(Object.keys(empty)).toHaveLength(ChannelFixtureCount.Zero);
    expect(Object.keys(retried)).toHaveLength(ChannelFixtureCount.One);
  });
});

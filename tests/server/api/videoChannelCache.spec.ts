import { afterEach, describe, expect, test } from "bun:test";
import {
  __resetVideoChannelCacheForTests,
  getVideoChannelCache,
  probeManifest,
  probedCatalog,
  selectNewsChannels,
  streamUrlsByChannel,
  unprobedCatalog,
} from "../../../src/server/api/videoChannelCache";

enum VideoFixtureId {
  Dead = "Dead.us",
  Fallback = "Fallback.us",
  Movies = "Movies.us",
  Nsfw = "Nsfw.us",
  Silent = "Silent.us",
  Zebra = "Zebra.us",
}

enum VideoFixtureUrl {
  DeadOne = "https://dead.example/one.m3u8",
  DeadTwo = "https://dead.example/two.m3u8",
  FallbackDead = "https://fallback.example/dead.m3u8",
  FallbackLive = "https://fallback.example/live.m3u8",
  MoviesLive = "https://movies.example/live.m3u8",
  Orphan = "https://orphan.example/x.m3u8",
  ZebraLive = "https://zebra.example/live.m3u8",
}

enum VideoFixtureName {
  Fallback = "CBS News Fallback",
  Zebra = "Zebra News",
}

enum VideoFixtureCount {
  Workers = 2,
  Zero = 0,
}

enum VideoFixtureHeader {
  AllowOrigin = "access-control-allow-origin",
  Any = "*",
}

enum VideoFixtureBody {
  Manifest = "#EXTM3U\n#EXT-X-VERSION:3\n",
  Html = "<html>not a stream</html>",
}

const CHANNELS = [
  { id: VideoFixtureId.Zebra, name: VideoFixtureName.Zebra, country: "US", languages: ["eng"], categories: ["News"], logo: null, is_nsfw: false },
  { id: VideoFixtureId.Fallback, name: VideoFixtureName.Fallback, country: "US", languages: ["eng"], categories: ["news"], logo: null, is_nsfw: false },
  { id: VideoFixtureId.Dead, name: "Dead Air", country: "US", languages: [], categories: ["general"], logo: null, is_nsfw: false },
  { id: VideoFixtureId.Movies, name: "Movies", country: "US", languages: [], categories: ["movies"], logo: null, is_nsfw: false },
  { id: VideoFixtureId.Nsfw, name: "After Dark", country: "US", languages: [], categories: ["news"], logo: null, is_nsfw: true },
  { id: VideoFixtureId.Silent, name: "No Stream", country: "US", languages: [], categories: ["news"], logo: null, is_nsfw: false },
];

const STREAMS = [
  { channel: VideoFixtureId.Fallback, url: VideoFixtureUrl.FallbackDead },
  { channel: VideoFixtureId.Fallback, url: VideoFixtureUrl.FallbackLive },
  { channel: VideoFixtureId.Dead, url: VideoFixtureUrl.DeadOne },
  { channel: VideoFixtureId.Dead, url: VideoFixtureUrl.DeadTwo },
  { channel: VideoFixtureId.Movies, url: VideoFixtureUrl.MoviesLive },
  { channel: VideoFixtureId.Nsfw, url: VideoFixtureUrl.MoviesLive },
  { channel: VideoFixtureId.Zebra, url: VideoFixtureUrl.ZebraLive },
  { channel: "", url: VideoFixtureUrl.Orphan },
];

const LIVE_URLS = new Set<string>([VideoFixtureUrl.FallbackLive, VideoFixtureUrl.MoviesLive, VideoFixtureUrl.ZebraLive]);
const probe = async (url: string): Promise<boolean> => LIVE_URLS.has(url);
const candidates = () => selectNewsChannels(CHANNELS, streamUrlsByChannel(STREAMS));

describe("selectNewsChannels", () => {
  test("keeps news and general channels that have a stream, with their streams in order", () => {
    const selected = candidates();

    expect(selected.map((candidate) => candidate.channel.id)).toEqual([
      VideoFixtureId.Zebra,
      VideoFixtureId.Fallback,
      VideoFixtureId.Dead,
    ]);
    expect(selected[1]?.urls).toEqual([VideoFixtureUrl.FallbackDead, VideoFixtureUrl.FallbackLive]);
    expect(selected[1]?.channel.featured).toBe(true);
  });
});

describe("unprobedCatalog", () => {
  test("lists every candidate with its first stream, featured first", () => {
    const catalog = unprobedCatalog(candidates());

    expect(Object.keys(catalog)).toEqual([VideoFixtureId.Fallback, VideoFixtureId.Dead, VideoFixtureId.Zebra]);
    expect(catalog[VideoFixtureId.Fallback]?.url).toBe(VideoFixtureUrl.FallbackDead);
  });
});

describe("probedCatalog", () => {
  test("keeps only channels with a live stream and picks the first live one", async () => {
    const catalog = await probedCatalog(candidates(), probe, VideoFixtureCount.Workers);

    expect(Object.keys(catalog)).toEqual([VideoFixtureId.Fallback, VideoFixtureId.Zebra]);
    expect(catalog[VideoFixtureId.Fallback]?.url).toBe(VideoFixtureUrl.FallbackLive);
    expect(catalog[VideoFixtureId.Zebra]?.url).toBe(VideoFixtureUrl.ZebraLive);
  });
});

describe("probeManifest", () => {
  const originalFetch = globalThis.fetch;
  const respond = (response: Response) => {
    globalThis.fetch = (async () => response) as unknown as typeof globalThis.fetch;
  };

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("accepts a manifest served with CORS", async () => {
    respond(new Response(VideoFixtureBody.Manifest, { headers: { [VideoFixtureHeader.AllowOrigin]: VideoFixtureHeader.Any } }));

    expect(await probeManifest(VideoFixtureUrl.FallbackLive)).toBe(true);
  });

  test("rejects a manifest without CORS, a non-manifest body, and an error status", async () => {
    respond(new Response(VideoFixtureBody.Manifest));
    expect(await probeManifest(VideoFixtureUrl.FallbackLive)).toBe(false);

    respond(new Response(VideoFixtureBody.Html, { headers: { [VideoFixtureHeader.AllowOrigin]: VideoFixtureHeader.Any } }));
    expect(await probeManifest(VideoFixtureUrl.FallbackLive)).toBe(false);

    respond(new Response(VideoFixtureBody.Manifest, { status: 403, headers: { [VideoFixtureHeader.AllowOrigin]: VideoFixtureHeader.Any } }));
    expect(await probeManifest(VideoFixtureUrl.FallbackLive)).toBe(false);
  });
});

describe("__resetVideoChannelCacheForTests", () => {
  afterEach(() => {
    __resetVideoChannelCacheForTests();
  });

  test("after reset, the cache is empty and unprobed", () => {
    __resetVideoChannelCacheForTests();
    const cache = getVideoChannelCache();

    expect(cache.probed).toBe(false);
    expect(cache.channelCount).toBe(VideoFixtureCount.Zero);
    expect(Object.keys(cache.catalog)).toHaveLength(VideoFixtureCount.Zero);
    expect(cache.error).toBeNull();
  });
});

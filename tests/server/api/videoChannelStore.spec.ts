import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, rm } from "fs/promises";
import { join } from "path";
import {
  readStoredCatalog,
  writeStoredCatalog,
} from "../../../src/server/api/videoChannelCache";

enum StoreFixturePath {
  Dir = "tests/.tmp/video-channel-store",
  File = "video-channels.json",
  Missing = "missing.json",
  Broken = "broken.json",
}

enum StoreFixtureTime {
  Now = 1_000_000,
  Ttl = 60_000,
  Fresh = 990_000,
  Stale = 900_000,
}

enum StoreFixtureId {
  Live = "Live.us",
}

const CATALOG = {
  [StoreFixtureId.Live]: {
    id: StoreFixtureId.Live,
    name: "Live News",
    logo: null,
    url: "https://live.example/master.m3u8",
    country: "US",
    languages: ["eng"],
    featured: false,
  },
};

const file = join(StoreFixturePath.Dir, StoreFixturePath.File);

afterEach(async () => {
  await rm(StoreFixturePath.Dir, { force: true, recursive: true });
});

describe("video channel store", () => {
  test("round-trips a probed catalog and reads it back while fresh", async () => {
    await writeStoredCatalog(file, { catalog: CATALOG, fetchedAt: StoreFixtureTime.Fresh });

    const stored = await readStoredCatalog(file, StoreFixtureTime.Now, StoreFixtureTime.Ttl);

    expect(stored?.fetchedAt).toBe(StoreFixtureTime.Fresh);
    expect(Object.keys(stored?.catalog ?? {})).toEqual([StoreFixtureId.Live]);
  });

  test("ignores a stale, missing or broken store", async () => {
    await writeStoredCatalog(file, { catalog: CATALOG, fetchedAt: StoreFixtureTime.Stale });
    await mkdir(StoreFixturePath.Dir, { recursive: true });
    await Bun.write(join(StoreFixturePath.Dir, StoreFixturePath.Broken), "{not json");

    expect(await readStoredCatalog(file, StoreFixtureTime.Now, StoreFixtureTime.Ttl)).toBeNull();
    expect(await readStoredCatalog(join(StoreFixturePath.Dir, StoreFixturePath.Missing), StoreFixtureTime.Now, StoreFixtureTime.Ttl)).toBeNull();
    expect(await readStoredCatalog(join(StoreFixturePath.Dir, StoreFixturePath.Broken), StoreFixtureTime.Now, StoreFixtureTime.Ttl)).toBeNull();
  });
});

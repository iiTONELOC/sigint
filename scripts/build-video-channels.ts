import { resolve } from "path";
import { readTextFile, writeGzipJson } from "./staticData";
import {
  selectNewsChannels,
  streamUrlsByChannel,
  unprobedCatalog,
} from "../src/server/api/videoChannelCache";

const OUTPUT_PATH = resolve(import.meta.dir, "../src/server/data/video-channels.json.gz");

async function buildCatalog(channelsPath: string, streamsPath: string): Promise<void> {
  const channels = JSON.parse(await readTextFile(channelsPath));
  const streams = JSON.parse(await readTextFile(streamsPath));
  const catalog = unprobedCatalog(selectNewsChannels(channels, streamUrlsByChannel(streams)));
  const bytes = await writeGzipJson(OUTPUT_PATH, catalog);
  console.log(`video channels: ${Object.keys(catalog).length}, ${bytes} bytes -> ${OUTPUT_PATH}`);
}

if (import.meta.main) {
  const [channelsPath, streamsPath] = process.argv.slice(2);
  if (!channelsPath || !streamsPath) {
    console.error("usage: bun run scripts/build-video-channels.ts <channels.json> <streams.json>");
    process.exit(1);
  }
  await buildCatalog(channelsPath, streamsPath);
}

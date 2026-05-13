// ── One-time KMZ fixture builder ─────────────────────────────────────
// Produces tests/fixtures/cyclones-cone/milton-al14-cone.kmz. Run once,
// commit the binary, leave the script in place for reproducibility.
//
//   bun run scripts/build-cone-kmz-fixture.ts
//
// Output is a single-entry ZIP archive (local file header + deflate-raw
// compressed payload, no central directory). Matches the shape that
// src/server/api/zipReader.ts unzipSingleEntryKmz() reads — the prompt
// authorized this minimal hand-written ZIP local file header form.
//
// Why not pull a real NHC KMZ over the network: this commit never
// reaches out. The KML payload below has 5 vertices forming a closed
// LinearRing, which is the only contract the cone parser cares about.

import { deflateRaw } from "zlib";
import { promisify } from "util";

const deflateRawAsync = promisify(deflateRaw);

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>AL142024 Advisory 13 Cone of Uncertainty</name>
    <Placemark>
      <name>Cone</name>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              -90.0,22.4,0
              -82.0,28.0,0
              -78.0,32.0,0
              -84.0,32.0,0
              -90.0,22.4,0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>
`;

const FILENAME = "doc.kml";

function writeUint16LE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32LE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = value & 0xff;
  buf[offset + 1] = (value >>> 8) & 0xff;
  buf[offset + 2] = (value >>> 16) & 0xff;
  buf[offset + 3] = (value >>> 24) & 0xff;
}

const uncompressed = new TextEncoder().encode(KML);
const compressed = new Uint8Array(
  (await deflateRawAsync(uncompressed)) as Buffer,
);
const crc = Bun.hash.crc32(uncompressed);
const fileName = new TextEncoder().encode(FILENAME);

const header = new Uint8Array(30);
writeUint32LE(header, 0, 0x04034b50); // local file header signature
writeUint16LE(header, 4, 20);          // version needed (2.0)
writeUint16LE(header, 6, 0);           // general purpose bit flag
writeUint16LE(header, 8, 8);           // compression method (deflate)
writeUint16LE(header, 10, 0);          // last mod time
writeUint16LE(header, 12, 0);          // last mod date
writeUint32LE(header, 14, crc);        // CRC-32 of uncompressed
writeUint32LE(header, 18, compressed.length);
writeUint32LE(header, 22, uncompressed.length);
writeUint16LE(header, 26, fileName.length);
writeUint16LE(header, 28, 0);          // extra field length

const out = new Uint8Array(header.length + fileName.length + compressed.length);
out.set(header, 0);
out.set(fileName, header.length);
out.set(compressed, header.length + fileName.length);

const path = "tests/fixtures/cyclones-cone/milton-al14-cone.kmz";
await Bun.write(path, out);
await Bun.write(
  Bun.stdout,
  `✓ wrote ${path} (${out.length} bytes, KML ${uncompressed.length} → ${compressed.length})\n`,
);

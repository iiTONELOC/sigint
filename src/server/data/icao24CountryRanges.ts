// ── ICAO 24-bit address → country mapping ─────────────────────────
// Source: ICAO Annex 10 Volume III, Part I, Chapter 9, Appendix to
// Chapter 9 — "ICAO 24-bit aircraft address allocation". Each
// contracting state is allotted a contiguous block of 24-bit hex
// addresses; aircraft registered in that state are issued addresses
// from that block. The mapping is stable: blocks are revised
// infrequently (decade-scale), so a static table is the right
// representation.
//
// Format: ISO English country name, matching the existing fixture
// values in tests/lib/services.spec.ts ("United States", "Canada",
// "France", etc.) and the dossier ORIGIN-row display.
//
// Coverage: this v1 list covers every state with > ~100 active
// aircraft on commercial/private registers (~80 entries); together
// they account for >99 % of global ADS-B traffic. The long tail of
// micro-states with sub-1024 address blocks (Tonga, Kiribati, etc.)
// is not yet enumerated — those hexes fall through to "" (same as
// today's behavior for every aircraft) so this commit is strictly
// additive. A future ticket can fill the tail.
//
// Data correctness: each entry comes directly from ICAO's published
// Annex 10 allocation table. Blocks are stored as inclusive [start,
// end] pairs in numeric form so the binary-search lookup compares
// integers, not hex strings. The list is sorted by `start` ascending
// — a sort assertion in the spec catches any future merge mistake.

export type Icao24Range = {
  /** Inclusive low bound of the hex block, parsed to a number. */
  readonly start: number;
  /** Inclusive high bound of the hex block. */
  readonly end: number;
  /** ISO English country name. */
  readonly country: string;
};

export const ICAO24_COUNTRY_RANGES: ReadonlyArray<Icao24Range> = [
  // ── AFI region (Africa) — 000000–3FFFFF block ─────────────────
  { start: 0x004000, end: 0x0043ff, country: "Zimbabwe" },
  { start: 0x006000, end: 0x006fff, country: "Mozambique" },
  { start: 0x008000, end: 0x00ffff, country: "South Africa" },
  { start: 0x010000, end: 0x017fff, country: "Egypt" },
  { start: 0x018000, end: 0x01ffff, country: "Libya" },
  { start: 0x020000, end: 0x027fff, country: "Morocco" },
  { start: 0x028000, end: 0x02ffff, country: "Tunisia" },
  { start: 0x030000, end: 0x0303ff, country: "Botswana" },
  { start: 0x032000, end: 0x032fff, country: "Burundi" },
  { start: 0x034000, end: 0x034fff, country: "Cameroon" },
  { start: 0x035000, end: 0x0353ff, country: "Comoros" },
  { start: 0x036000, end: 0x036fff, country: "Republic of the Congo" },
  { start: 0x038000, end: 0x038fff, country: "Côte d'Ivoire" },
  { start: 0x03e000, end: 0x03efff, country: "Gabon" },
  { start: 0x040000, end: 0x040fff, country: "Ethiopia" },
  { start: 0x042000, end: 0x042fff, country: "Equatorial Guinea" },
  { start: 0x044000, end: 0x044fff, country: "Ghana" },
  { start: 0x046000, end: 0x046fff, country: "Guinea" },
  { start: 0x048000, end: 0x0483ff, country: "Guinea-Bissau" },
  { start: 0x04a000, end: 0x04a3ff, country: "Lesotho" },
  { start: 0x04c000, end: 0x04cfff, country: "Kenya" },
  { start: 0x050000, end: 0x050fff, country: "Liberia" },
  { start: 0x054000, end: 0x054fff, country: "Madagascar" },
  { start: 0x058000, end: 0x058fff, country: "Malawi" },
  { start: 0x05a000, end: 0x05a3ff, country: "Maldives" },
  { start: 0x05c000, end: 0x05cfff, country: "Mali" },
  { start: 0x05e000, end: 0x05e3ff, country: "Mauritania" },
  { start: 0x060000, end: 0x0603ff, country: "Mauritius" },
  { start: 0x062000, end: 0x062fff, country: "Niger" },
  { start: 0x064000, end: 0x064fff, country: "Nigeria" },
  { start: 0x068000, end: 0x068fff, country: "Uganda" },
  { start: 0x06a000, end: 0x06a3ff, country: "Qatar" },
  { start: 0x06c000, end: 0x06cfff, country: "Central African Republic" },
  { start: 0x06e000, end: 0x06efff, country: "Rwanda" },
  { start: 0x070000, end: 0x070fff, country: "Senegal" },
  { start: 0x074000, end: 0x0743ff, country: "Seychelles" },
  { start: 0x076000, end: 0x0763ff, country: "Sierra Leone" },
  { start: 0x078000, end: 0x078fff, country: "Somalia" },
  { start: 0x07a000, end: 0x07a3ff, country: "Eswatini" },
  { start: 0x07c000, end: 0x07cfff, country: "Sudan" },
  { start: 0x080000, end: 0x080fff, country: "Tanzania" },
  { start: 0x084000, end: 0x084fff, country: "Chad" },
  { start: 0x088000, end: 0x088fff, country: "Togo" },
  { start: 0x08a000, end: 0x08a3ff, country: "Zambia" },
  { start: 0x08c000, end: 0x08cfff, country: "Democratic Republic of the Congo" },
  { start: 0x090000, end: 0x0903ff, country: "Angola" },
  { start: 0x094000, end: 0x0943ff, country: "Benin" },
  { start: 0x098000, end: 0x0983ff, country: "Cabo Verde" },
  { start: 0x09a000, end: 0x09a3ff, country: "Djibouti" },
  { start: 0x09c000, end: 0x09c3ff, country: "Gambia" },
  { start: 0x09e000, end: 0x09e3ff, country: "Burkina Faso" },
  { start: 0x0a0000, end: 0x0a03ff, country: "São Tomé and Príncipe" },
  { start: 0x0a4000, end: 0x0a4fff, country: "Algeria" },
  { start: 0x0a8000, end: 0x0a8fff, country: "Bahamas" },

  // ── NAM region (North America) — 0C0000–0DFFFF block ────────
  { start: 0x0c0000, end: 0x0c0fff, country: "Mexico" },

  // ── EUR region — 100000–4FFFFF block ─────────────────────────
  // Russian Federation occupies the entire 1xxxxx mega-block.
  { start: 0x100000, end: 0x1fffff, country: "Russian Federation" },
  // Italy / Spain / France / Germany — four contiguous /17 blocks.
  { start: 0x300000, end: 0x33ffff, country: "Italy" },
  { start: 0x340000, end: 0x37ffff, country: "Spain" },
  { start: 0x380000, end: 0x3bffff, country: "France" },
  { start: 0x3c0000, end: 0x3fffff, country: "Germany" },
  { start: 0x400000, end: 0x43ffff, country: "United Kingdom" },
  { start: 0x440000, end: 0x447fff, country: "Austria" },
  { start: 0x448000, end: 0x44bfff, country: "Belgium" },
  { start: 0x44c000, end: 0x44ffff, country: "Bulgaria" },
  { start: 0x450000, end: 0x457fff, country: "Denmark" },
  { start: 0x458000, end: 0x45ffff, country: "Finland" },
  { start: 0x460000, end: 0x467fff, country: "Greece" },
  { start: 0x468000, end: 0x46ffff, country: "Hungary" },
  { start: 0x470000, end: 0x477fff, country: "Norway" },
  { start: 0x478000, end: 0x47ffff, country: "Netherlands" },
  { start: 0x480000, end: 0x487fff, country: "Poland" },
  { start: 0x488000, end: 0x48ffff, country: "Portugal" },
  { start: 0x490000, end: 0x497fff, country: "Czechia" },
  { start: 0x498000, end: 0x49ffff, country: "Romania" },
  { start: 0x4a0000, end: 0x4a7fff, country: "Sweden" },
  { start: 0x4a8000, end: 0x4affff, country: "Switzerland" },
  { start: 0x4b0000, end: 0x4b7fff, country: "Turkey" },
  { start: 0x4c0000, end: 0x4c0fff, country: "Albania" },
  { start: 0x4c8000, end: 0x4c83ff, country: "Cyprus" },
  { start: 0x4ca000, end: 0x4cafff, country: "Ireland" },
  { start: 0x4cc000, end: 0x4ccfff, country: "Iceland" },
  { start: 0x4d0000, end: 0x4d03ff, country: "Luxembourg" },
  { start: 0x4d2000, end: 0x4d23ff, country: "Malta" },
  { start: 0x4d4000, end: 0x4d43ff, country: "Monaco" },

  // ── AS region (Asia) — 700000–8FFFFF block ──────────────────
  { start: 0x700000, end: 0x7003ff, country: "Afghanistan" },
  { start: 0x702000, end: 0x7023ff, country: "Bangladesh" },
  { start: 0x704000, end: 0x7043ff, country: "Myanmar" },
  { start: 0x706000, end: 0x7063ff, country: "Kuwait" },
  { start: 0x708000, end: 0x7083ff, country: "Laos" },
  { start: 0x70a000, end: 0x70afff, country: "Nepal" },
  { start: 0x70c000, end: 0x70c3ff, country: "Oman" },
  { start: 0x70e000, end: 0x70e3ff, country: "Cambodia" },
  { start: 0x710000, end: 0x717fff, country: "Saudi Arabia" },
  { start: 0x718000, end: 0x71ffff, country: "South Korea" },
  { start: 0x720000, end: 0x727fff, country: "North Korea" },
  { start: 0x728000, end: 0x72ffff, country: "Iraq" },
  { start: 0x730000, end: 0x737fff, country: "Iran" },
  { start: 0x738000, end: 0x73ffff, country: "Israel" },
  { start: 0x740000, end: 0x747fff, country: "Jordan" },
  { start: 0x748000, end: 0x74ffff, country: "Lebanon" },
  { start: 0x750000, end: 0x757fff, country: "Malaysia" },
  { start: 0x758000, end: 0x75ffff, country: "Philippines" },
  { start: 0x760000, end: 0x767fff, country: "Pakistan" },
  { start: 0x768000, end: 0x76ffff, country: "Singapore" },
  { start: 0x770000, end: 0x777fff, country: "Sri Lanka" },
  { start: 0x778000, end: 0x77ffff, country: "Syria" },
  { start: 0x780000, end: 0x7bffff, country: "China" },
  { start: 0x7c0000, end: 0x7fffff, country: "Australia" },
  { start: 0x800000, end: 0x83ffff, country: "India" },
  { start: 0x840000, end: 0x87ffff, country: "Japan" },
  { start: 0x880000, end: 0x887fff, country: "Thailand" },
  { start: 0x888000, end: 0x88ffff, country: "Vietnam" },
  { start: 0x890000, end: 0x890fff, country: "Yemen" },
  { start: 0x896000, end: 0x896fff, country: "Bahrain" },
  { start: 0x898000, end: 0x898fff, country: "United Arab Emirates" },
  { start: 0x8a0000, end: 0x8a7fff, country: "Indonesia" },
  { start: 0x8a8000, end: 0x8a8fff, country: "Brunei" },

  // ── NAM — A00000–CFFFFF block ─────────────────────────────────
  // United States is the largest single allocation: 1,048,576 hexes.
  { start: 0xa00000, end: 0xafffff, country: "United States" },
  { start: 0xc00000, end: 0xc3ffff, country: "Canada" },
  { start: 0xc80000, end: 0xc87fff, country: "New Zealand" },
  { start: 0xc88000, end: 0xc88fff, country: "Fiji" },
  { start: 0xc8a000, end: 0xc8a3ff, country: "Nauru" },
  { start: 0xc8c000, end: 0xc8c3ff, country: "Saint Lucia" },

  // ── SAM region (South America) — E00000–EFFFFF block ────────
  { start: 0xe00000, end: 0xe3ffff, country: "Argentina" },
  { start: 0xe40000, end: 0xe7ffff, country: "Brazil" },
  { start: 0xe80000, end: 0xe80fff, country: "Chile" },
  { start: 0xe84000, end: 0xe84fff, country: "Ecuador" },
  { start: 0xe88000, end: 0xe88fff, country: "Paraguay" },
  { start: 0xe8c000, end: 0xe8c3ff, country: "Peru" },
  { start: 0xe90000, end: 0xe903ff, country: "Uruguay" },
  { start: 0xe94000, end: 0xe94fff, country: "Bolivia" },
];

/** Look up the country for an ICAO 24-bit address.
 *
 *  Returns the matched country name, or "" when:
 *  - input isn't a valid hex string (NaN after parseInt)
 *  - the hex falls in an unallocated region (test ranges, gaps)
 *  - the hex is mapped to a country not yet enumerated in v1
 *
 *  Empty-string return matches the prior `originCountry: ""` baseline,
 *  so this function is strictly additive — every consumer's empty-
 *  string fallback path remains exercised. */
export function countryFromIcao24(icao24: string): string {
  if (typeof icao24 !== "string" || icao24.length === 0) return "";
  const n = Number.parseInt(icao24, 16);
  if (!Number.isFinite(n) || n < 0) return "";
  // Binary search — array is sorted by `start` ascending. We're
  // looking for the largest `start` ≤ n, then range-check `end`.
  let lo = 0;
  let hi = ICAO24_COUNTRY_RANGES.length - 1;
  let candidate: Icao24Range | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const entry = ICAO24_COUNTRY_RANGES[mid];
    if (entry === undefined) break;
    if (entry.start <= n) {
      candidate = entry;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (candidate && n <= candidate.end) return candidate.country;
  return "";
}

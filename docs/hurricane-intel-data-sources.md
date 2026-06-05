# Hurricane Intel — Data Source Research

Research for adding intel-grade tropical-cyclone features. For each source: free?
client-fetchable (CORS) or must-proxy? license? data shape? cadence? Verified via
multi-source adversarial check. Sources are overwhelmingly US-gov public domain.

> **App context that shapes every recommendation:** NHC has **no CORS** and the app
> already server-proxies all NHC products (`cyclonesCache.ts` etc.). So every
> nhc.noaa.gov / ftp.nhc.noaa.gov source below = **proxy it**, same pattern. The
> app already bundles Natural Earth (`ne_50m_land.json`) and enriches aircraft
> server-side from a metadata DB — two existing hooks we reuse.

---

## 1. Watches & Warnings (geographic) — "who is officially threatened"

**Two independent free sources, both good:**

### A) NHC GIS — Advisory Watches & Warnings
- **Free:** yes (US gov, public domain). No explicit license/attribution.
- **Format:** shapefile (`.zip`) **and KMZ/KML**. Per-storm `_latest` file keyed to
  storm ID with a `WW` token: `…/storm_graphics/api/{STORMID}_WW_latest.kmz`
  (e.g. `EP012026_WW_latest.kmz`). Predictable URL — no advisory number needed.
- **Discovery:** the basin RSS feeds (`/gis-at.xml`, `/gis-ep.xml`) enumerate
  "Advisory Watches & Warnings [shp] [kml]" per active storm, with pubDate/guid +
  ATCF ID in the title — parse to find current products.
- **CORS:** none → **proxy** (we already do, KMZ via `DecompressionStream`).
- **Caveat:** NHC labels GIS feeds **experimental**, "may not be available 24/7."
- **Cadence:** per advisory (~6h, more on changes).

### B) NWS Alerts API (`api.weather.gov/alerts/active`) — the easier one
- **Free:** yes, open data, **no API key**. Requires a `User-Agent` header with a
  contact (any string). Recommend ≤1 request / 30s (rate-limited firewall).
- **Format:** **GeoJSON by default** (geometry included → directly renderable), also
  JSON-LD and CAP v1.2 XML. RFC 7946.
- **Query:** `?point=lat,lon`, `?area=FL`, `?region=AT`, `?zone=…`. Filter for
  tropical events (Hurricane Warning/Watch, Tropical Storm Warning/Watch).
- **CORS:** generally usable, but the app proxies everything server-side anyway and
  the UA-header requirement is cleaner server-side → **proxy**.
- **Cadence:** new CAP alerts <45s from creation.

**Recommendation:** Use **NWS Alerts API GeoJSON** as primary (clean GeoJSON, no
decode step) for the warning polygons/zones; optionally layer NHC's `_WW_` KMZ for
the canonical NHC breakpoint segments. Both proxied. **This is the #1 intel layer.**

---

## 2. Wind Speed Probabilities (34/50/64 kt)

- **Free:** yes (NHC, public domain).
- **Formats:** shapefile (polygons @5km, points @half-degree), **KMZ** per threshold,
  and **GRIB1/GRIB2** gridded. `…/forecast/archive/wsp_120hr5km_latest.zip`
  (polygons), `wsp_120hrhalfDeg_latest.zip` (points). Also listed in the RSS feeds:
  "120h Wind Speed Probabilities (34kt, 50kt, 64kt) [shp] [kml]".
- **Cadence:** every **6 hours** (each forecast cycle).
- **CORS:** none → **proxy**.
- **Gotcha:** the *cumulative* NDFD probability grids (>34kt TS-force, >64kt
  hurricane-force) require the **tkdegrib GRIB2 decoder + MDL portal registration** —
  NOT a plain endpoint. **Avoid the GRIB path.** Use the **KMZ/shapefile polygons**
  instead (`Large Polygon` output, `ProbWindSpdN` field, ~10 probability bins for
  symbology matching NHC's graphics).
- **Already half-done:** the app fetches the `MIAPWSAT` *text* product. This adds the
  *geographic* surface.

**Recommendation:** fetch the **WSP KMZ/shapefile polygons** (proxy + decode like the
cone), render as a filled-probability layer. Skip GRIB. Free, license-OK.

---

## 3. Forecast intensity over time / rapid-intensification

- **Source:** already in hand — `CurrentStorms.json` forecast track + the structured
  forecast advisory (TCM). Each forecast point carries valid time + max wind → build
  the **intensity-vs-time curve** and flag **RI** (≥30 kt gain in 24h) directly. No
  new fetch.
- **Free/CORS/license:** N/A (already ingested + proxied).

**Recommendation:** pure client/worker math on data we already have. Cheapest win.

---

## 4. Hurricane Hunter / recon aircraft (ADS-B identification) — **uniquely ours**

We already ingest ADS-B. Match these **known ICAO hex codes** (verified):

**USAF 53rd WRS (WC-130J, callsigns TEAL 70–79 / CODY), Keesler AFB:**
`AE0111, AE0112, AE0113, AE0114, AE0116, AE0117, AE0258, AE0259, AE04A1`
(tails 96-5300 … 99-5309; fleet of 10).

**NOAA Aircraft Operations Center (Lakeland, FL):**
- `A4FAC3` — N42RF — WP-3D Orion "Kermit" (flies *through* storms)
- `A52242` — N43RF — WP-3D Orion "Miss Piggy"
- `A60F3C` — N49RF — Gulfstream IV-SP "Gonzo" (flies *around* the storm)

- **Free/license:** these are facts, not a dataset — bake the hex list into the
  existing server-side aircraft enrichment DB. No fetch, no license.
- **Bonus:** NHC publishes recon *data* products (RECCO, Vortex Data Message,
  Dropsondes, HDOBs) per basin — text/message feeds, proxy-able if we ever want the
  actual fixes (separate, later).

**Recommendation:** add a `reconType` enrichment field keyed on these ~12 hex codes;
highlight recon birds (special icon/color) when inside/near a cone. **High intel
value, ~zero cost, leverages existing ADS-B pipeline.**

---

## 5. Model spaghetti / ensemble tracks

- **Source:** NHC/NCEP **ATCF a-deck** files (`aid_public` adecks) on
  ftp.nhc.noaa.gov / nomads — individual model tracks (GFS, ECMWF→"EMX", HWRF, HMON,
  GEFS members) per storm in the fixed-width ATCF format.
- **Free:** yes (US gov). **ECMWF tracks via the ATCF a-deck are included** (as EMX),
  i.e. free through NOAA even though ECMWF's own raw model isn't.
- **Format:** **fixed-width ATCF text** — needs a parser (well-documented format).
- **CORS:** none → **proxy**.
- **Cadence:** per model cycle (~6h).
- **Caveat:** heaviest lift (ATCF parsing + many tracks to render). The chat history
  already flagged this as the deferred "v1.1 spaghetti."

**Recommendation:** free and doable, but **do it last** — parse a-deck server-side,
ship simplified per-model polylines. Defer until layers 1–4 land.

---

## 6. Population / asset overlay (cone ↔ who/what is hit)

All **free, public domain, client-bundleable**:

| Dataset | What | Format | License | Notes |
|---|---|---|---|---|
| **Natural Earth — Populated Places** | cities + population | shapefile/GeoJSON | **public domain, no attribution** | same source as our existing `ne_50m_land`; drop-in |
| **OurAirports** | global airports | nightly **CSV** (`airports.csv` …) at `davidmegginson.github.io/ourairports-data/` | **public domain, no attribution** | fetchable, **no CORS restriction noted**; daily fresh |
| **World Port Index (NGA)** | ports | (gov, public domain) | public domain | for port-closure / ship-flee correlation |

- **Recommendation:** bundle **Natural Earth populated places** (cities+pop) and
  **OurAirports** (airports) as static assets server-side; compute cone/warning ∩
  assets in the existing correlation worker. "Cone intersects N ports, M airports,
  X million people." Public domain, zero license burden, no per-request fetch.

---

## 7. Historical analog tracks (IBTrACS / HURDAT2)

- **IBTrACS** (NOAA NCEI): most complete global best-track, **1842→present, 6 basins.**
  - **Free:** full & open (WDC open-access).
  - **Format:** CSV, NetCDF, **point & line shapefiles** at direct
    `ncei.noaa.gov/…/ibtracs/v04r01/access/…` paths; subsets: `active`,
    `last3years`, `since1980`, per-basin.
  - **Cadence:** 3×/week (Sun/Tue/Thu) — includes recent/active.
  - **License caveat:** **citation required** (DOI `10.25921/82ty-9e16`) and follows
    **WMO Resolution 40** for *commercial* use — i.e. not strictly public domain.
    Fine for this app with attribution; flag if it ever goes commercial.
  - **CORS:** NCEI direct HTTP → likely **proxy** (and the file is large).

**Recommendation:** for "tracks like Hurricane X (2017)," fetch an IBTrACS subset
(e.g. `since1980` per basin) **server-side once**, store, and run analog matching
there. Add the DOI citation. Lower priority (nice-to-have).

---

## 8. NHC GIS portal (the index for #1, #2, #5)

- **Canonical:** `https://www.nhc.noaa.gov/gis/` + the **RSS feeds**
  `/gis-at.xml` (Atlantic) and `/gis-ep.xml` (E. Pacific) — the machine-readable
  index of all per-advisory GIS products (cone, track, **WW**, **WSP**, wind radii).
- **Formats:** shapefile `.zip` + **KMZ/KML** (and GRIB for WSP).
- **`_latest` convention:** stable URLs keyed to storm ID (`{BASIN}{NN}{YYYY}`,
  e.g. `EP012026`) — fetch active-storm files without the advisory number.
- **License/CORS:** no explicit license (public domain in practice), **no CORS**,
  **experimental** availability. → **proxy + cache** (already our pattern).

**Recommendation:** parse `/gis-at.xml` + `/gis-ep.xml` server-side to discover
current WW / WSP / radii product URLs per active storm, then proxy+cache like the
cone. One feed-parse unlocks layers 1, 2, and wind-radii.

---

## Build-order recommendation (by value ÷ cost)

1. **Warnings/Watches layer** (NWS Alerts GeoJSON, proxied) — *the* intel layer.
2. **Recon-aircraft highlight** (12 hex codes into existing enrichment) — uniquely ours, ~free.
3. **Cone ↔ asset/population overlap** (Natural Earth + OurAirports, correlation worker) — actionable.
4. **Intensity curve + RI flag** (data we already have) — cheap.
5. **Wind-speed-probability polygons** (WSP KMZ, proxied) — solid layer, moderate.
6. **Storm ↔ aircraft/ship correlation** (existing correlation engine) — diversions, port flee.
7. **Model spaghetti** (ATCF a-deck, proxied) — heaviest; defer.
8. **Historical analogs** (IBTrACS subset) — nice-to-have; attribution required.

**Everything is free and license-clean.** Only IBTrACS needs attribution (DOI + WMO
Res-40). Everything from NHC must be **server-proxied** (no CORS) — which the app
already does. Natural Earth + OurAirports are public-domain and bundleable.

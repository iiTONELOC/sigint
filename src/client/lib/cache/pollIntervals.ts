// One owner for each feature's client poll cadence (ms). Each value matches the
// server's refresh rhythm for that feed so the client doesn't poll faster than
// the data changes. The hooks read these instead of each defining their own.

export const POLL_INTERVALS = {
  /** Live ADS-B positions — moves fast, polled often. */
  aircraft: 15_000,
  /** AIS vessel snapshot — server streams continuously; pull frequently. */
  ships: 15_000,
  /** USGS quake feed updates on a few-minute cadence. */
  earthquakes: 420_000,
  /** NWS alerts. */
  weather: 300_000,
  /** GDELT event export drops every 15 min. */
  events: 900_000,
  /** NASA FIRMS bulk fire file. */
  fires: 600_000,
  /** RSS news feeds. */
  news: 600_000,
} as const;

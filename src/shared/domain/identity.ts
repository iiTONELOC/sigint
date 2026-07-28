/**
 * One declaration per identity string. A source id and a point type overlap on
 * five of them, so two enums meant five strings written twice. A string enum
 * member must have a literal initializer, so one enum cannot be derived from
 * another: declaring them together and selecting subsets with types is the only
 * way each string appears once.
 *
 * Values are the wire and cache format. They do not change.
 */
export enum Domain {
  Aircraft = "aircraft",
  Ships = "ships",
  Events = "events",
  Weather = "weather",
  Cyclones = "cyclones",

  // Source-only. Seismic and fire are singular as a source and plural as a
  // point type; that drift is load bearing until a cache migration.
  Earthquake = "earthquake",
  Fire = "fire",
  News = "news",
  CycloneWarnings = "cycloneWarnings",

  // Point-type-only.
  Quakes = "quakes",
  Fires = "fires",
  CyclonesForecast = "cyclones-forecast",
  CyclonesWarning = "cyclones-warning",
}

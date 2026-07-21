export const AIRCRAFT_SCENE = {
  attributeStride: 3,
  stringAttributeStride: 1,
  attributes: {
    heading: 0,
    flags: 1,
    squawk: 2,
  },
  stringAttributes: {
    country: 0,
  },
  flags: {
    military: 1,
    recon: 2,
    onGround: 4,
  },
  squawks: {
    normal: 0,
    emergency: 1,
    radioFailure: 2,
    hijack: 3,
  },
} as const;

export type AircraftSquawkBucket =
  | "7700"
  | "7600"
  | "7500"
  | "other";

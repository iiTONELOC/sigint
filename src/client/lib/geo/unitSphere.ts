import {
  DEGREES_TO_RADIANS,
  EARTH_RADIUS_METERS,
  RADIANS_TO_DEGREES,
} from "@shared/geo";

export type ProjectedUnitVectorBuffer = {
  x: number;
  y: number;
  z: number;
};

export type UnitVector = Readonly<ProjectedUnitVectorBuffer>;

export type GlobeRotationMatrix = Readonly<{
  m00: number;
  m01: number;
  m02: number;
  m10: number;
  m11: number;
  m12: number;
  m20: number;
  m21: number;
  m22: number;
}>;

export type ProjectedUnitVector = Readonly<ProjectedUnitVectorBuffer>;

function createVector(
  x: number,
  y: number,
  z: number,
): ProjectedUnitVectorBuffer {
  return { x, y, z };
}

export function geographicToUnitVector(
  latitude: number,
  longitude: number,
): UnitVector {
  const latitudeRadians = latitude * DEGREES_TO_RADIANS;
  const longitudeRadians = longitude * DEGREES_TO_RADIANS;
  const latitudeRadius = Math.cos(latitudeRadians);
  return createVector(
    latitudeRadius * Math.cos(longitudeRadians),
    Math.sin(latitudeRadians),
    -latitudeRadius * Math.sin(longitudeRadians),
  );
}
export type GeographicMotion = Readonly<{
  latitude: number;
  longitude: number;
  latitudeRate: number;
  longitudeRate: number;
  unit: UnitVector;
  unitVelocity: UnitVector;
}>;

export type GeographicPosition = Readonly<{
  latitude: number;
  longitude: number;
}>;

const MIN_LONGITUDE_RADIUS = 1e-9;

export function createGeographicMotion(
  latitude: number,
  longitude: number,
  headingDegrees: number,
  speedMetersPerSecond: number,
): GeographicMotion {
  const latitudeRadians = latitude * DEGREES_TO_RADIANS;
  const longitudeRadians = longitude * DEGREES_TO_RADIANS;
  const headingRadians = headingDegrees * DEGREES_TO_RADIANS;
  const latitudeSine = Math.sin(latitudeRadians);
  const latitudeCosine = Math.cos(latitudeRadians);
  const longitudeSine = Math.sin(longitudeRadians);
  const longitudeCosine = Math.cos(longitudeRadians);
  const headingCosine = Math.cos(headingRadians);
  const headingSine = Math.sin(headingRadians);
  const angularRate = speedMetersPerSecond / EARTH_RADIUS_METERS;
  const north = createVector(
    -latitudeSine * longitudeCosine,
    latitudeCosine,
    latitudeSine * longitudeSine,
  );
  const east = createVector(-longitudeSine, 0, -longitudeCosine);
  const longitudeRadius =
    Math.abs(latitudeCosine) < MIN_LONGITUDE_RADIUS ? null : latitudeCosine;

  return {
    latitude,
    longitude,
    latitudeRate: angularRate * headingCosine * RADIANS_TO_DEGREES,
    longitudeRate: longitudeRadius
      ? (angularRate * headingSine * RADIANS_TO_DEGREES) / longitudeRadius
      : 0,
    unit: geographicToUnitVector(latitude, longitude),
    unitVelocity: createVector(
      angularRate * (north.x * headingCosine + east.x * headingSine),
      angularRate * (north.y * headingCosine + east.y * headingSine),
      angularRate * (north.z * headingCosine + east.z * headingSine),
    ),
  };
}

export function advanceUnitMotion(
  motion: GeographicMotion,
  elapsedSeconds: number,
): UnitVector {
  const x = motion.unit.x + motion.unitVelocity.x * elapsedSeconds;
  const y = motion.unit.y + motion.unitVelocity.y * elapsedSeconds;
  const z = motion.unit.z + motion.unitVelocity.z * elapsedSeconds;
  const length = Math.hypot(x, y, z);
  if (length === 0) return motion.unit;
  return createVector(x / length, y / length, z / length);
}

export function advanceGeographicMotion(
  motion: GeographicMotion,
  elapsedSeconds: number,
): GeographicPosition {
  const longitude =
    motion.longitude + motion.longitudeRate * elapsedSeconds;
  const wrappedLongitude = ((longitude + 180) % 360 + 360) % 360 - 180;
  return {
    latitude: motion.latitude + motion.latitudeRate * elapsedSeconds,
    longitude: wrappedLongitude,
  };
}

export function createGlobeRotationMatrix(
  longitudeRotation: number,
  latitudeRotation: number,
): GlobeRotationMatrix {
  const longitudeCosine = Math.cos(longitudeRotation);
  const longitudeSine = Math.sin(longitudeRotation);
  const latitudeCosine = Math.cos(latitudeRotation);
  const latitudeSine = Math.sin(latitudeRotation);

  return {
    m00: longitudeCosine,
    m01: 0,
    m02: longitudeSine,
    m10: longitudeSine * latitudeSine,
    m11: latitudeCosine,
    m12: -longitudeCosine * latitudeSine,
    m20: -longitudeSine * latitudeCosine,
    m21: latitudeSine,
    m22: longitudeCosine * latitudeCosine,
  };
}

export function projectUnitVectorInto(
  unit: UnitVector,
  matrix: GlobeRotationMatrix,
  centerX: number,
  centerY: number,
  radius: number,
  output: ProjectedUnitVectorBuffer,
): void {
  const rotatedX =
    matrix.m00 * unit.x + matrix.m01 * unit.y + matrix.m02 * unit.z;
  const rotatedY =
    matrix.m10 * unit.x + matrix.m11 * unit.y + matrix.m12 * unit.z;
  const depth =
    matrix.m20 * unit.x + matrix.m21 * unit.y + matrix.m22 * unit.z;
  output.x = centerX + rotatedX * radius;
  output.y = centerY - rotatedY * radius;
  output.z = depth;
}

export function projectUnitVector(
  unit: UnitVector,
  matrix: GlobeRotationMatrix,
  centerX: number,
  centerY: number,
  radius: number,
): ProjectedUnitVector {
  const output = createVector(0, 0, 0);
  projectUnitVectorInto(
    unit,
    matrix,
    centerX,
    centerY,
    radius,
    output,
  );
  return output;
}

export function projectGeographicPoint(
  latitude: number,
  longitude: number,
  centerX: number,
  centerY: number,
  radius: number,
  longitudeRotation: number,
  latitudeRotation: number,
): ProjectedUnitVector {
  return projectUnitVector(
    geographicToUnitVector(latitude, longitude),
    createGlobeRotationMatrix(longitudeRotation, latitudeRotation),
    centerX,
    centerY,
    radius,
  );
}

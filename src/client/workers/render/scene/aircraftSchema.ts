export enum AircraftSceneSchema {
  AttributeStride = 5,
  StringAttributeStride = 1,
  MotionAttributeOffset = 3,
}

export enum AircraftSceneAttribute {
  Heading = 0,
  Flags = 1,
  Squawk = 2,
}

export enum AircraftSceneStringAttribute {
  Country = 0,
}

export enum AircraftSceneFlag {
  Military = 1,
  Recon = 2,
  OnGround = 4,
}

export enum AircraftSceneSquawk {
  Normal = 0,
  Emergency = 1,
  RadioFailure = 2,
  Hijack = 3,
}

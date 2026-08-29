enum TsunamiPhysicsPolicy {
  GravityMetersPerSecondSquared = 9.81,
  KilometersPerHourPerMeterPerSecond = 3.6,
  DeepOceanDepthMeters = 4000,
  ShelfDepthMeters = 200,
  ShoreDepthMeters = 20,
}

enum TsunamiRegion {
  DeepOcean = "DEEP OCEAN",
  NearShore = "NEAR SHORE",
  Shelf = "SHELF",
}

const TSUNAMI_DEPTH_BY_REGION: Readonly<Record<TsunamiRegion, number>> = {
  [TsunamiRegion.DeepOcean]: TsunamiPhysicsPolicy.DeepOceanDepthMeters,
  [TsunamiRegion.Shelf]: TsunamiPhysicsPolicy.ShelfDepthMeters,
  [TsunamiRegion.NearShore]: TsunamiPhysicsPolicy.ShoreDepthMeters,
};

function speedKmh(depthM: number): number {
  return Math.sqrt(
    TsunamiPhysicsPolicy.GravityMetersPerSecondSquared * depthM,
  ) * TsunamiPhysicsPolicy.KilometersPerHourPerMeterPerSecond;
}

export function TsunamiPhysics() {
  return (
    <div className="flex flex-col gap-1.5">
      {Object.entries(TSUNAMI_DEPTH_BY_REGION).map(([region, depth]) => (
        <div key={region} className="flex items-baseline justify-between gap-2 text-(length:--sig-text-xs)">
          <span className="text-sig-dim tracking-wide">{region}</span>
          <span className="text-sig-bright font-mono">
            {Math.round(speedKmh(depth))} km/h
            <span className="text-sig-dim ml-1">~{depth} m</span>
          </span>
        </div>
      ))}
      <div className="text-(length:--sig-text-xs) text-sig-dim mt-0.5">
        wave speed = √(g·depth) · slows toward shore
      </div>
    </div>
  );
}

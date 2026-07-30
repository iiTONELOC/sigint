import type { DataPoint } from "@/features/base/dataPoints";

function rnd(a = 0, b = 1) {
  return Math.random() * (b - a) + a;
}

export function generateMockAircraft(): DataPoint[] {
  return Array.from({ length: 40 }, (_, i) => {
    let lat = rnd(-50, 65),
      lon = rnd(-170, 170);
    if (i < 12) {
      lat = rnd(38, 55);
      lon = rnd(-8, 25);
    } else if (i < 22) {
      lat = rnd(28, 48);
      lon = rnd(-122, -72);
    } else if (i < 28) {
      lat = rnd(20, 40);
      lon = rnd(100, 140);
    }

    const cs = ["UAL", "AAL", "DAL", "RYR", "BAW", "DLH", "AFR", "SWA"];
    const ac = ["B738", "A320", "B77W", "A388", "B789", "E190"];

    return {
      id: `A${i}`,
      type: "aircraft",
      lat,
      lon,
      data: {
        callsign: `${cs[i % 8]}${Math.floor(rnd(1000, 9999))}`,
        acType: ac[i % 6],
        altitude: Math.floor(rnd(5000, 42000)),
        speed: Math.floor(rnd(180, 530)),
        heading: Math.floor(rnd(0, 360)),
      },
    };
  });
}

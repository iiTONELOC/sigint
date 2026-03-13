export type DataType =
  | "ships"
  | "aircraft"
  | "events"
  | "quakes"
  | "satellites"
  | "cyber"
  | "bgp"
  | "radio";

export interface BasePoint {
  id: string;
  type: DataType;
  lat: number;
  lon: number;
  timestamp?: string;
}

export interface ShipData {
  name?: string;
  vesselType?: string;
  flag?: string;
  speed?: number;
  heading?: number;
}

export interface AircraftData {
  callsign?: string;
  icao24?: string;
  acType?: string;
  altitude?: number;
  speed?: number;
  heading?: number;
  verticalRate?: number;
  originCountry?: string;
  audioStream?: string;
  airport?: string;
  frequency?: string;
}

export interface EventData {
  category?: string;
  headline?: string;
  source?: string;
  severity?: number;
}

export interface QuakeData {
  magnitude?: number;
  depth?: number;
  location?: string;
}

export type DataPoint =
  | (BasePoint & { type: "ships"; data: ShipData })
  | (BasePoint & { type: "aircraft"; data: AircraftData })
  | (BasePoint & { type: "events"; data: EventData })
  | (BasePoint & { type: "quakes"; data: QuakeData });

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

export function generateMockNonAircraft(): DataPoint[] {
  const ships: DataPoint[] = Array.from({ length: 55 }, (_, i) => {
    let lat = rnd(-60, 60),
      lon = rnd(-170, 170);
    if (i < 12) {
      lat = rnd(0, 7);
      lon = rnd(98, 108);
    } else if (i < 20) {
      lat = rnd(28, 33);
      lon = rnd(31, 35);
    } else if (i < 28) {
      lat = rnd(48, 55);
      lon = rnd(-5, 8);
    } else if (i < 35) {
      lat = rnd(22, 28);
      lon = rnd(-82, -68);
    }

    const types = [
      "Cargo",
      "Tanker",
      "Container",
      "Bulk Carrier",
      "Fishing",
      "Tug",
    ];
    const flags = ["PA", "LR", "MH", "SG", "HK", "GB", "NO", "GR", "CN"];

    return {
      id: `S${i}`,
      type: "ships",
      lat,
      lon,
      data: {
        name: `${types[i % 6]} ${100 + i}`,
        vesselType: types[i % 6],
        flag: flags[i % 9],
        speed: rnd(2, 20),
        heading: Math.floor(rnd(0, 360)),
      },
    };
  });

  const events: DataPoint[] = Array.from({ length: 35 }, (_, i) => {
    let lat = rnd(-40, 60),
      lon = rnd(-160, 160);
    if (i < 8) {
      lat = rnd(30, 37);
      lon = rnd(33, 46);
    } else if (i < 14) {
      lat = rnd(46, 52);
      lon = rnd(30, 42);
    } else if (i < 18) {
      lat = rnd(4, 14);
      lon = rnd(-8, 12);
    } else if (i < 22) {
      lat = rnd(25, 36);
      lon = rnd(58, 70);
    }

    const cats = [
      "Protest",
      "Military Action",
      "Diplomatic",
      "Conflict",
      "Humanitarian",
      "Political Crisis",
    ];
    const heads = [
      "Mass protests erupt in capital",
      "Military convoy near border",
      "Emergency diplomatic summit",
      "Artillery exchange reported",
      "Aid convoy blocked",
      "Opposition leader detained",
      "Naval vessels deployed",
      "Ceasefire talks stall",
      "Cyber attack on infrastructure",
      "Election results contested",
      "Refugee camp expands",
      "Trade embargo announced",
      "Air defense activated",
      "Border crossing shut down",
      "UN emergency session called",
      "Comms blackout reported",
    ];
    const srcs = ["Reuters", "AFP", "AP", "Al Jazeera", "BBC", "TASS"];

    return {
      id: `E${i}`,
      type: "events",
      lat,
      lon,
      timestamp: new Date(Date.now() - rnd(0, 14400000)).toISOString(),
      data: {
        category: cats[i % 6],
        headline: heads[i % 16],
        source: srcs[i % 6],
        severity: Math.floor(rnd(1, 6)),
      },
    };
  });

  const quakes: DataPoint[] = Array.from({ length: 22 }, (_, i) => {
    let lat = rnd(-55, 65),
      lon = rnd(-170, 170);
    if (i < 5) {
      lat = rnd(32, 40);
      lon = rnd(130, 145);
    } else if (i < 9) {
      lat = rnd(-20, -5);
      lon = rnd(-78, -70);
    } else if (i < 12) {
      lat = rnd(35, 42);
      lon = rnd(26, 36);
    } else if (i < 15) {
      lat = rnd(58, 64);
      lon = rnd(-155, -145);
    }

    return {
      id: `Q${i}`,
      type: "quakes",
      lat,
      lon,
      timestamp: new Date(Date.now() - rnd(0, 7200000)).toISOString(),
      data: {
        magnitude: rnd(1.2, 7.1),
        depth: Math.floor(rnd(5, 300)),
        location: `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}`,
      },
    };
  });

  return [...ships, ...quakes, ...events];
}

export function generateMockData(): DataPoint[] {
  return [...generateMockNonAircraft(), ...generateMockAircraft()];
}

import { useEffect, useState } from "react";

const API = "https://api.planespotters.net/pub/photos/hex";

export type AircraftPhoto = Readonly<{
  src: string;
  link: string;
  photographer: string;
  width: number;
  height: number;
}>;

type PsPhoto = {
  thumbnail: { src: string; size: { width: number; height: number } };
  thumbnail_large?: { src: string; size: { width: number; height: number } };
  link: string;
  photographer: string;
};

async function fetchPhoto(
  icao24: string,
  registration: string | undefined,
  signal: AbortSignal,
): Promise<AircraftPhoto | null> {
  const query = registration
    ? `?reg=${encodeURIComponent(registration)}`
    : "";
  const url = `${API}/${icao24.toUpperCase()}${query}`;

  const res = await fetch(url, { signal });
  if (!res.ok) return null;
  const data = (await res.json()) as { photos?: PsPhoto[] };
  const first = data.photos?.[0];
  if (!first) return null;
  const thumb = first.thumbnail_large ?? first.thumbnail;
  return {
    src: thumb.src,
    link: first.link,
    photographer: first.photographer,
    width: thumb.size.width,
    height: thumb.size.height,
  };
}

export type AircraftPhotoState = {
  readonly photo: AircraftPhoto | null;
  readonly loading: boolean;
};

export function useAircraftPhoto(
  icao24: string,
  reg?: string,
): AircraftPhotoState {
  const [photo, setPhoto] = useState<AircraftPhoto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!icao24) {
      setPhoto(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setPhoto(null);
    setLoading(true);
    (async () => {
      try {
        let result = await fetchPhoto(icao24, undefined, controller.signal);
        if (!result && reg) {
          result = await fetchPhoto(icao24, reg, controller.signal);
        }
        if (!controller.signal.aborted) {
          setPhoto(result);
          setLoading(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setPhoto(null);
          setLoading(false);
        }
      }
    })();
    return () => {
      controller.abort();
    };
  }, [icao24, reg]);

  return { photo, loading };
}

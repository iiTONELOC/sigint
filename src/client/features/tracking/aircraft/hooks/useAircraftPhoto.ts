// Fetched client-side (viewer's IP) so it isn't blocked like the server-IP call.
import { useEffect, useState } from "react";
import type { AircraftPhoto } from "@/panes/dossier/dossierTypes";

const API = "https://api.planespotters.net/pub/photos/hex";

type PsPhoto = {
  thumbnail: { src: string; size: { width: number; height: number } };
  thumbnail_large?: { src: string; size: { width: number; height: number } };
  link: string;
  photographer: string;
};

async function fetchPhoto(
  icao24: string,
  reg: string | undefined,
  typeCode: string | undefined,
  signal: AbortSignal,
): Promise<AircraftPhoto | null> {
  let url = `${API}/${icao24.toUpperCase()}`;
  const params: string[] = [];
  if (reg) params.push(`reg=${encodeURIComponent(reg)}`);
  if (typeCode) params.push(`icaoType=${encodeURIComponent(typeCode)}`);
  if (params.length > 0) url += `?${params.join("&")}`;

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
  typeCode?: string,
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
    let cancelled = false;
    setPhoto(null);
    setLoading(true);
    (async () => {
      try {
        let p = await fetchPhoto(icao24, undefined, undefined, controller.signal);
        if (!p && reg) p = await fetchPhoto(icao24, reg, typeCode, controller.signal);
        if (!cancelled) {
          setPhoto(p);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled && (err as Error)?.name !== "AbortError") {
          setPhoto(null);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [icao24, reg, typeCode]);

  return { photo, loading };
}

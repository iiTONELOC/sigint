import { useEffect, useState } from "react";
import { fetchEncyclopedia } from "@/lib/net/encyclopedia";
import {
  EncyclopediaRoute,
  type EncyclopediaTypeAnswer,
  type EncyclopediaTypeQuery,
} from "@shared/domain/encyclopedia";

const API = "https://api.planespotters.net/pub/photos";

enum SpotterLookup {
  Hex = "hex",
  Registration = "reg",
}

export type AircraftPhoto = Readonly<{
  src: string;
  link: string;
  photographer: string;
  width: number;
  height: number;
  stock: boolean;
}>;

type PsPhoto = {
  thumbnail: { src: string; size: { width: number; height: number } };
  thumbnail_large?: { src: string; size: { width: number; height: number } };
  link: string;
  photographer: string;
};

async function fetchPhoto(
  lookup: SpotterLookup,
  key: string,
  signal: AbortSignal,
): Promise<AircraftPhoto | null> {
  try {
    const res = await fetch(`${API}/${lookup}/${encodeURIComponent(key)}`, { signal });
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
      stock: false,
    };
  } catch {
    return null;
  }
}

async function fetchStockPhoto(
  stock: EncyclopediaTypeQuery,
): Promise<AircraftPhoto | null> {
  if (!Object.values(stock).some(Boolean)) return null;
  const answer = await fetchEncyclopedia<EncyclopediaTypeAnswer>(EncyclopediaRoute.AircraftType, stock);
  const article = answer?.article;
  if (!article?.image) return null;
  return {
    src: article.image.src,
    link: article.url,
    photographer: article.title,
    width: article.image.width,
    height: article.image.height,
    stock: true,
  };
}

export type AircraftPhotoState = {
  readonly photo: AircraftPhoto | null;
  readonly loading: boolean;
};

export function useAircraftPhoto(
  icao24: string,
  reg?: string,
  stock: EncyclopediaTypeQuery = {},
): AircraftPhotoState {
  const { description, manufacturer, model } = stock;
  const [photo, setPhoto] = useState<AircraftPhoto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!icao24) {
      setPhoto(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const { signal } = controller;
    setPhoto(null);
    setLoading(true);
    (async () => {
      let result = await fetchPhoto(SpotterLookup.Hex, icao24.toUpperCase(), signal);
      if (!result && reg && !signal.aborted) {
        result = await fetchPhoto(SpotterLookup.Registration, reg, signal);
      }
      if (!result && !signal.aborted) {
        result = await fetchStockPhoto({ description, manufacturer, model });
      }
      if (!signal.aborted) {
        setPhoto(result);
        setLoading(false);
      }
    })();
    return () => {
      controller.abort();
    };
  }, [icao24, reg, description, manufacturer, model]);

  return { photo, loading };
}

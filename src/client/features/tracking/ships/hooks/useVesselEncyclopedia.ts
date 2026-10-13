import { useEffect, useState } from "react";
import { fetchEncyclopedia } from "@/lib/net/encyclopedia";
import {
  EncyclopediaRoute,
  EncyclopediaVesselQueryKey,
  type EncyclopediaVesselAnswer,
  type EncyclopediaVesselQuery,
} from "@shared/domain/encyclopedia";

const NOTHING_KNOWN: EncyclopediaVesselAnswer = { article: null, photo: null };

export function useVesselEncyclopedia(query: EncyclopediaVesselQuery): EncyclopediaVesselAnswer {
  const { imo, mmsi, name } = query;
  const [answer, setAnswer] = useState<EncyclopediaVesselAnswer>(NOTHING_KNOWN);

  useEffect(() => {
    setAnswer(NOTHING_KNOWN);
    if (!imo && !mmsi && !name) return;
    let live = true;
    fetchEncyclopedia<EncyclopediaVesselAnswer>(EncyclopediaRoute.Vessel, {
      [EncyclopediaVesselQueryKey.Imo]: imo ? String(imo) : undefined,
      [EncyclopediaVesselQueryKey.Mmsi]: mmsi ? String(mmsi) : undefined,
      [EncyclopediaVesselQueryKey.Name]: name,
    }).then((found) => {
      if (live) setAnswer(found ?? NOTHING_KNOWN);
    });
    return () => {
      live = false;
    };
  }, [imo, mmsi, name]);

  return answer;
}

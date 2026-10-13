import { useEffect, useState } from "react";
import { fetchEncyclopedia } from "@/lib/net/encyclopedia";
import {
  EncyclopediaQuery,
  EncyclopediaRoute,
  type EncyclopediaVesselAnswer,
} from "@shared/domain/encyclopedia";

const NOTHING_KNOWN: EncyclopediaVesselAnswer = { article: null, photo: null };

export function useVesselEncyclopedia(imo: number | undefined): EncyclopediaVesselAnswer {
  const [answer, setAnswer] = useState<EncyclopediaVesselAnswer>(NOTHING_KNOWN);

  useEffect(() => {
    setAnswer(NOTHING_KNOWN);
    if (!imo || imo <= 0) return;
    let live = true;
    fetchEncyclopedia<EncyclopediaVesselAnswer>(EncyclopediaRoute.Vessel, {
      [EncyclopediaQuery.Imo]: String(imo),
    }).then((found) => {
      if (live) setAnswer(found ?? NOTHING_KNOWN);
    });
    return () => {
      live = false;
    };
  }, [imo]);

  return answer;
}

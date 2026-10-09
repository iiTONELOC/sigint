import { useMemo } from "react";
import { Tornado } from "lucide-react";
import { Domain } from "@shared/domain/identity";
import { compassPointForDegrees } from "@shared/domain/compass";
import { CYCLONE_CATEGORY_METADATA } from "@shared/domain/cyclones";
import { bearingDegrees, haversineKm } from "@shared/geo";
import type { CyclonePoint } from "@/features/environmental/cyclones/data/codec";
import { POINT_UI_QUERY_POLICY } from "@/features/base/uiQueryPolicy";
import { useSourceQuery } from "@/features/base/useSourceQuery";
import { DossierCard, DossierLabel, DossierSectionLabel, DossierStatCell } from "@/dossier";
import { formatKtShort, formatNauticalMiles, kmToNm } from "@/measurements";
import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
import {
  PointUiQueryKind,
  TableSortDirection,
  TableSortKey,
  type PointUiQuery,
} from "@/workers/data/uiQuery";

const ALL_STORMS_QUERY: PointUiQuery = {
  kind: PointUiQueryKind.Table,
  minValue: 0,
  sortKey: TableSortKey.Value1,
  sortDirection: TableSortDirection.Descending,
  offset: 0,
  limit: POINT_UI_QUERY_POLICY.bboxCandidateLimit,
};

type NearestStorm = Readonly<{ storm: CyclonePoint; distanceKm: number; bearing: number }>;

function nearestStorm(
  storms: readonly CyclonePoint[],
  latitude: number,
  longitude: number,
): NearestStorm | null {
  let nearest: NearestStorm | null = null;
  for (const storm of storms) {
    const distanceKm = haversineKm(latitude, longitude, recordLatitude(storm), recordLongitude(storm));
    if (nearest && nearest.distanceKm <= distanceKm) continue;
    const bearing = bearingDegrees(latitude, longitude, recordLatitude(storm), recordLongitude(storm));
    nearest = { storm, distanceKm, bearing };
  }
  return nearest;
}

type Props = Readonly<{ latitude: number; longitude: number }>;

export function AircraftStormProximity({ latitude, longitude }: Props) {
  const storms = useSourceQuery(Domain.Cyclones, ALL_STORMS_QUERY);
  const nearest = useMemo(
    () => (storms ? nearestStorm(storms.items, latitude, longitude) : null),
    [storms, latitude, longitude],
  );
  if (!nearest) return null;
  const { data } = nearest.storm;
  const bearing = Math.round(nearest.bearing);
  return (
    <section className="sec storm min-w-0 @min-[40rem]/dossier:col-span-2">
      <DossierSectionLabel>NEAREST STORM</DossierSectionLabel>
      <DossierCard className="p-3 flex flex-col gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Tornado className="w-4 h-4 shrink-0 text-(--dossier-accent)" aria-hidden={true} />
          <span className="text-(length:--sig-text-lg) font-bold text-sig-bright truncate">{data.name}</span>
          <DossierLabel className="ml-auto shrink-0">
            {CYCLONE_CATEGORY_METADATA[data.classification].label}
          </DossierLabel>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <DossierStatCell label="DIST" value={formatNauticalMiles(kmToNm(nearest.distanceKm))} />
          <DossierStatCell label="BEARING" value={`${bearing}° ${compassPointForDegrees(bearing)}`} />
          <DossierStatCell label="MAX WIND" value={formatKtShort(data.maxWindKt)} />
        </div>
      </DossierCard>
    </section>
  );
}

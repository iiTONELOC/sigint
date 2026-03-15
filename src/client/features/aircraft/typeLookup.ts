export type AircraftMetadata = {
  icao24: string;
  resolvedType: string;
  typecode?: string;
  model?: string;
  manufacturerName?: string;
  registration?: string;
  operator?: string;
  operatorIcao?: string;
  categoryDescription?: string;
};

function normalizeIcao24(value: string | undefined): string | null {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^['"]|['"]$/g, "");
  if (!normalized) return null;
  if (!/^[0-9a-f]+$/i.test(normalized)) return null;
  return normalized.length < 6 ? normalized.padStart(6, "0") : normalized;
}

function safeMetadata(value: unknown): AircraftMetadata | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<AircraftMetadata>;
  const icao24 = normalizeIcao24(item.icao24);
  const resolvedType =
    typeof item.resolvedType === "string" && item.resolvedType.trim().length > 0
      ? item.resolvedType
      : "Unknown";
  if (!icao24) return null;

  return {
    icao24,
    resolvedType,
    typecode: item.typecode,
    model: item.model,
    manufacturerName: item.manufacturerName,
    registration: item.registration,
    operator: item.operator,
    operatorIcao: item.operatorIcao,
    categoryDescription: item.categoryDescription,
  };
}

export async function getAircraftMetadata(
  icao24?: string,
): Promise<AircraftMetadata | null> {
  const key = normalizeIcao24(icao24);
  if (!key) return null;

  try {
    const response = await fetch(`/api/aircraft/metadata/${key}`);
    if (!response.ok) return null;
    const body = (await response.json()) as { item?: unknown };
    const { item = null } = body;
    return safeMetadata(item);
  } catch {
    return null;
  }
}

export async function getAircraftMetadataBatch(
  icao24List: string[],
): Promise<Map<string, AircraftMetadata>> {
  const normalized = Array.from(
    new Set(
      icao24List
        .map((value) => normalizeIcao24(value))
        .filter((value): value is string => value !== null),
    ),
  );

  if (normalized.length === 0) return new Map<string, AircraftMetadata>();

  try {
    const ids = normalized.join(",");
    const response = await fetch(
      `/api/aircraft/metadata/batch?ids=${encodeURIComponent(ids)}`,
    );

    if (!response.ok) return new Map<string, AircraftMetadata>();

    const body = (await response.json()) as { items?: unknown[] };
    const { items = [] } = body;

    const map = new Map<string, AircraftMetadata>();
    for (const item of items) {
      const metadata = safeMetadata(item);
      if (!metadata) continue;
      map.set(metadata.icao24, metadata);
    }

    return map;
  } catch {
    return new Map<string, AircraftMetadata>();
  }
}

export async function getAircraftType(icao24?: string): Promise<string | null> {
  const metadata = await getAircraftMetadata(icao24);
  return metadata?.resolvedType ?? null;
}

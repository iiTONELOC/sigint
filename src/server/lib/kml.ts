import { createGeoPoint, type GeoPoint } from "@shared/geo";

export enum KmlElement {
  Coordinates = "coordinates",
  Description = "description",
  Name = "name",
  Point = "point",
  StyleUrl = "styleurl",
}

export enum KmlCoordinateError {
  Triple = "Malformed coordinate triple",
  Value = "Malformed coordinate value",
}

enum CdataMarker {
  Open = "<![CDATA[",
  Close = "]]>",
}

const PLACEMARK_SPLIT = /<Placemark\b/i;
const OUTER_RING_PATTERN = /<outerBoundaryIs[\s\S]*?<coordinates[^>]*>([\s\S]*?)<\/coordinates>/gi;
const LINE_STRING_PATTERN = /<LineString[\s\S]*?<coordinates[^>]*>([\s\S]*?)<\/coordinates>/gi;
const COORDINATE_SEPARATOR = /\s+/;
const STYLE_REFERENCE_PREFIX = "#";

/** Each placemark's markup, in document order. */
export function kmlPlacemarks(kml: string): string[] {
  return kml.split(PLACEMARK_SPLIT).slice(1);
}

/** The trimmed text of the first element of a kind, case-insensitively, from an offset. */
export function kmlElementText(source: string, element: KmlElement, from = 0): string | null {
  const lowercaseSource = source.toLowerCase();
  const openTag = `<${element}>`;
  const closeTag = `</${element}>`;
  const openIndex = lowercaseSource.indexOf(openTag, from);
  if (openIndex < 0) return null;
  const start = openIndex + openTag.length;
  const end = lowercaseSource.indexOf(closeTag, start);
  return end < 0 ? null : source.slice(start, end).trim();
}

/** The placemark description with any CDATA wrapper removed. */
export function kmlDescription(placemark: string): string {
  const description = kmlElementText(placemark, KmlElement.Description);
  if (!description?.toUpperCase().startsWith(CdataMarker.Open)) return description ?? "";
  const content = description.slice(CdataMarker.Open.length);
  return content.endsWith(CdataMarker.Close)
    ? content.slice(0, -CdataMarker.Close.length).trim()
    : content;
}

/** The style id a placemark references, without the leading "#". */
export function kmlStyleId(placemark: string): string | null {
  const reference = kmlElementText(placemark, KmlElement.StyleUrl);
  return reference?.startsWith(STYLE_REFERENCE_PREFIX) ? reference.slice(STYLE_REFERENCE_PREFIX.length) : reference;
}

/** Parse a KML coordinates list; a malformed entry throws instead of being skipped. */
export function parseKmlCoordinates(text: string): GeoPoint[] {
  const points: GeoPoint[] = [];
  for (const triple of text.trim().split(COORDINATE_SEPARATOR)) {
    if (triple.length === 0) continue;
    const parts = triple.split(",");
    if (parts.length < 2) throw new Error(KmlCoordinateError.Triple);
    const point = createGeoPoint(Number.parseFloat(parts[0] ?? ""), Number.parseFloat(parts[1] ?? ""));
    if (!point) throw new Error(KmlCoordinateError.Value);
    points.push(point);
  }
  return points;
}

/** Every polygon outer ring in the markup. */
export function kmlOuterRings(source: string): GeoPoint[][] {
  return [...source.matchAll(OUTER_RING_PATTERN)].map((match) => parseKmlCoordinates(match[1] ?? ""));
}

/** Every line string in the markup. */
export function kmlLineStrings(source: string): GeoPoint[][] {
  return [...source.matchAll(LINE_STRING_PATTERN)].map((match) => parseKmlCoordinates(match[1] ?? ""));
}

import type { ComponentType } from "react";
import type { LucideIcon, LucideProps } from "lucide-react";
import type { IntelSeverity } from "@shared/domain/correlation";
import { EMPTY_TEXT } from "@shared/text";
import type { DataType } from "./dataPoints";
import { IconStrokeWidth } from "./types";

enum FeatureIconFill {
  Current = "currentColor",
}

export enum FeatureIconStyle {
  Filled = "filled",
  Stroked = "stroked",
}

export enum FeatureColorClassName {
  Aircraft = "text-sig-aircraft",
  Ships = "text-sig-ships",
  Events = "text-sig-events",
  Quakes = "text-sig-quakes",
  Fires = "text-sig-fires",
  Weather = "text-sig-weather",
  Cyclones = "text-sig-cyclones",
}

export enum FeatureTableAbbreviation {
  Aircraft = "AC",
  Ships = "AIS",
  Events = "EVT",
  Quakes = "EQ",
  Fires = "FI",
  Weather = "WX",
}

export type FeatureIconProps = Pick<LucideProps, "fill" | "strokeWidth">;

export type FeatureTablePresentation = Readonly<{
  abbreviation: string;
  classification: string;
  classificationRank: number;
  detail: string;
  detailRank: number;
  name: string;
}>;

export type FeatureFeedPresentation = Readonly<{
  category: string;
  headline: string;
  location: string;
  severity: IntelSeverity;
  source: string;
  url: string | null;
}>;

export type TickerRendererProps = Readonly<{
  data: unknown;
  textColor: string;
  dimColor: string;
}>;

export type FeatureDefinition = Readonly<{
  id: DataType;
  label: string;
  icon: LucideIcon;
  iconStyle: FeatureIconStyle;
  colorClassName: FeatureColorClassName;
  includeInDataTable?: boolean;
  includeInRawFeed?: boolean;
  buildDetailRows: (data: unknown, timestamp?: string) => [string, string][];
  tablePresentation: (data: unknown, id: string) => FeatureTablePresentation;
  feedPresentation: (data: unknown, id: string) => FeatureFeedPresentation;
  TickerContent: ComponentType<TickerRendererProps>;
  getSearchText?: (data: unknown) => string;
}>;

type TypedFeatureDefinition<TData, TType extends DataType> = Readonly<{
  id: TType;
  label: string;
  icon: LucideIcon;
  iconStyle: FeatureIconStyle;
  colorClassName: FeatureColorClassName;
  includeInDataTable?: boolean;
  includeInRawFeed?: boolean;
  buildDetailRows: (data: TData, timestamp?: string) => [string, string][];
  tablePresentation: (data: TData, id: string) => FeatureTablePresentation;
  feedPresentation: (data: TData, id: string) => FeatureFeedPresentation;
  TickerContent: ComponentType<TickerRendererProps>;
  getSearchText?: (data: TData) => string;
}>;

export function defineFeature<TData, TType extends DataType>(
  definition: TypedFeatureDefinition<TData, TType>,
): FeatureDefinition {
  const getSearchText = definition.getSearchText;
  return {
    id: definition.id,
    label: definition.label,
    icon: definition.icon,
    iconStyle: definition.iconStyle,
    colorClassName: definition.colorClassName,
    ...(definition.includeInDataTable === undefined
      ? {}
      : { includeInDataTable: definition.includeInDataTable }),
    ...(definition.includeInRawFeed === undefined
      ? {}
      : { includeInRawFeed: definition.includeInRawFeed }),
    buildDetailRows: (data, timestamp) =>
      definition.buildDetailRows(data as TData, timestamp),
    tablePresentation: (data, id) =>
      definition.tablePresentation(data as TData, id),
    feedPresentation: (data, id) =>
      definition.feedPresentation(data as TData, id),
    TickerContent: definition.TickerContent,
    ...(getSearchText
      ? { getSearchText: (data: unknown) => getSearchText(data as TData) }
      : {}),
  };
}

export function featureIconProps(
  style: FeatureIconStyle,
): FeatureIconProps {
  if (style === FeatureIconStyle.Filled) {
    return {
      fill: FeatureIconFill.Current,
      strokeWidth: IconStrokeWidth.None,
    };
  }
  return { strokeWidth: IconStrokeWidth.Standard };
}

export function emptyFeatureTablePresentation(
  id: string,
  abbreviation: string,
): FeatureTablePresentation {
  return {
    abbreviation,
    classification: EMPTY_TEXT,
    classificationRank: 0,
    detail: EMPTY_TEXT,
    detailRank: 0,
    name: id,
  };
}

export function emptyFeatureFeedPresentation(
  id: string,
  severity: IntelSeverity,
): FeatureFeedPresentation {
  return {
    category: EMPTY_TEXT,
    headline: id,
    location: EMPTY_TEXT,
    severity,
    source: EMPTY_TEXT,
    url: null,
  };
}

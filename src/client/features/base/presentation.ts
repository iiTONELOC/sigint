import type { ComponentType } from "react";
import type { LucideIcon, LucideProps } from "lucide-react";
import type { IntelSeverity } from "@shared/domain/correlation";
import type { SelectedIsolateMode } from "@/workers/render/protocol";
import { EMPTY_TEXT } from "@shared/text";
import type { DataPoint, DataType } from "./dataPoints";
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

export enum FeaturePresentationText {
  Separator = " · ",
  Unknown = "Unknown",
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
}>;

export type FeatureSearchPresentation = Readonly<{
  primary: string;
  secondary: string;
}>;

type FeaturePoint<TType extends DataType> = Extract<
  DataPoint,
  Readonly<{ type: TType }>
>;

export type FeatureDossierProps<
  TType extends DataType = DataType,
> = Readonly<{
  item: FeaturePoint<TType>;
  requestItem?: DataPoint | null;
  isolateMode: SelectedIsolateMode;
  onLocate: () => void;
  onFocus: () => void;
  onSolo: () => void;
  onClose: () => void;
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
  alertDetail?: (data: unknown) => readonly string[];
  DetailSummary?: ComponentType<Readonly<{ item: DataPoint }>> | null;
  searchPresentation: (
    data: unknown,
    id: string,
  ) => FeatureSearchPresentation | null;
  tickerSummary?: (data: unknown) => readonly string[];
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
  alertDetail?: (data: TData) => readonly string[];
  DetailSummary?: ComponentType<Readonly<{ item: DataPoint }>> | null;
  searchPresentation?: (
    data: TData,
    id: string,
  ) => FeatureSearchPresentation;
  tickerSummary?: (data: TData) => readonly string[];
  getSearchText?: (data: TData) => string;
}>;

export function defineFeature<TData, TType extends DataType>(
  definition: TypedFeatureDefinition<TData, TType>,
): FeatureDefinition {
  const alertDetail = definition.alertDetail;
  const getSearchText = definition.getSearchText;
  const searchPresentation = definition.searchPresentation;
  const tickerSummary = definition.tickerSummary;
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
    alertDetail: (data) => alertDetail?.(data as TData) ?? [],
    DetailSummary: definition.DetailSummary,
    searchPresentation: (data, id) =>
      searchPresentation?.(data as TData, id) ?? null,
    tickerSummary: (data) => tickerSummary?.(data as TData) ?? [],
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

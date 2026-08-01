export enum SettingsClassName {
  ActionLabel = "font-semibold tracking-wider",
  ActiveOption = "bg-sig-accent/10 border-sig-accent/40 text-sig-accent",
  CompactSectionTitle = "text-xs text-sig-dim tracking-widest mb-2",
  DataList = "divide-y divide-gray-700",
  DataRow = "flex flex-col sm:flex-row sm:justify-between gap-0.5",
  DataText = "flex-1 min-w-0",
  DimText = "text-sig-dim",
  DimIcon = "text-sig-dim shrink-0",
  DividerSection = "pt-2 border-t border-sig-border/30",
  InactiveOption = "bg-transparent border-sig-border/50 text-sig-dim hover:text-sig-text hover:border-sig-border",
  ItemTitle = "text-sm text-sig-text font-semibold tracking-wider",
  OptionLabel = "text-[10px] font-semibold tracking-wider",
  Options = "flex gap-2",
  SectionStack = "space-y-5",
  SectionTitle = "text-xs text-sig-dim tracking-widest mb-3",
  StandardText = "text-sig-text",
  SupportingText = "text-xs text-sig-dim/60 mt-1.5 leading-snug",
}

export enum SettingsIconSize {
  Tiny = 10,
  News = 11,
  Small = 12,
  Storage = 13,
  Standard = 14,
  Large = 18,
}

export enum SettingsIconStrokeWidth {
  Standard = 2.5,
}

export enum SettingsTiming {
  WalkthroughLaunchDelayMs = 300,
  ImportReloadDelayMs = 1_000,
  ImportErrorClearDelayMs = 4_000,
}

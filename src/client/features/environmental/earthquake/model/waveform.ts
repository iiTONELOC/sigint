export enum WaveformChannel {
  BroadbandHighGainVertical = "BHZ",
  ExtremelyShortPeriodVertical = "EHZ",
  HighBroadbandHighGainVertical = "HHZ",
  LongPeriodHighGainVertical = "LHZ",
  ShortPeriodHighGainVertical = "SHZ",
}

export enum WaveformStatus {
  Failed = "failed",
  Loading = "loading",
  Ready = "ready",
  Unavailable = "unavailable",
}

export enum WaveformUnavailableReason {
  EventTime = "invalid-event-time",
  RecordedTrace = "no-recorded-trace",
  Station = "no-active-station",
  StationService = "station-service-unavailable",
}

export type Waveform = Readonly<{
  channel: WaveformChannel;
  network: string;
  rawSamples: number[];
  sampleRate: number;
  samples: number[];
  station: string;
}>;

export type WaveformResult =
  | Readonly<{ status: WaveformStatus.Ready; waveform: Waveform }>
  | Readonly<{
      reason: WaveformUnavailableReason;
      status: WaveformStatus.Unavailable;
    }>;

export type WaveformState =
  | Readonly<{ status: WaveformStatus.Loading }>
  | WaveformResult;

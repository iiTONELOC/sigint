enum ByteFormatPolicy {
  BytesPerKilobyte = 1_024,
  DecimalPlaces = 1,
}

export function formatBytes(bytes: number): string {
  if (bytes < ByteFormatPolicy.BytesPerKilobyte) return `${bytes} B`;

  const kilobytes = bytes / ByteFormatPolicy.BytesPerKilobyte;
  if (kilobytes < ByteFormatPolicy.BytesPerKilobyte) {
    return `${kilobytes.toFixed(ByteFormatPolicy.DecimalPlaces)} KB`;
  }

  const megabytes = kilobytes / ByteFormatPolicy.BytesPerKilobyte;
  return `${megabytes.toFixed(ByteFormatPolicy.DecimalPlaces)} MB`;
}

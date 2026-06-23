// NWS alert text is teletype-wrapped at ~70 cols with hard newlines, so it
// renders as ragged narrow lines that don't reflow. Unwrap intra-paragraph
// breaks (keep blank-line paragraph breaks) so the text flows to the pane width.
export function unwrapNwsText(text: string): string {
  return text
    .replaceAll("\r", "")
    .split(/\n{2,}/)
    .map((p) => p.replaceAll("\n", " ").replaceAll(/ {2,}/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

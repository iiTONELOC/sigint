import {
  BLANK_SEPARATOR,
  CARRIAGE_RETURN,
  EMPTY_TEXT,
  LINE_BREAK,
  PARAGRAPH_BREAK,
  PARAGRAPH_SPLIT,
  REPEATED_SPACES,
  SEMICOLON_SEPARATOR,
} from "@shared/text";

// NWS alert text is teletype-wrapped at ~70 cols with hard newlines, so it
// renders as ragged narrow lines that don't reflow. Unwrap intra-paragraph
// breaks (keep blank-line paragraph breaks) so the text flows to the pane width.
export function unwrapNwsText(text: string): string {
  return text
    .replaceAll(CARRIAGE_RETURN, EMPTY_TEXT)
    .split(PARAGRAPH_SPLIT)
    .map((paragraph) =>
      paragraph
        .replaceAll(LINE_BREAK, BLANK_SEPARATOR)
        .replaceAll(REPEATED_SPACES, BLANK_SEPARATOR)
        .trim(),
    )
    .filter(Boolean)
    .join(PARAGRAPH_BREAK);
}

export function weatherAreas(areaDesc: string | undefined): readonly string[] {
  if (!areaDesc) return [];
  return areaDesc
    .split(SEMICOLON_SEPARATOR)
    .map((area) => area.trim())
    .filter(Boolean);
}

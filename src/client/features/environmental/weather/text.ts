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
const LIST_ITEM_START = /^\s*[-*]\s/;

function unwrapParagraph(paragraph: string): string {
  const lines: string[] = [];
  for (const line of paragraph.split(LINE_BREAK)) {
    const previous = lines.at(-1);
    if (previous === undefined || LIST_ITEM_START.test(line)) lines.push(line.trim());
    else lines[lines.length - 1] = `${previous}${BLANK_SEPARATOR}${line.trim()}`;
  }
  return lines.map((line) => line.replaceAll(REPEATED_SPACES, BLANK_SEPARATOR)).join(LINE_BREAK).trim();
}

export function unwrapNwsText(text: string): string {
  return text
    .replaceAll(CARRIAGE_RETURN, EMPTY_TEXT)
    .split(PARAGRAPH_SPLIT)
    .map(unwrapParagraph)
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

export const BLANK_SEPARATOR = " ";
export const EMPTY_TEXT = "";
export const CARRIAGE_RETURN = "\r";
export const LINE_BREAK = "\n";
export const PARAGRAPH_BREAK = `${LINE_BREAK}${LINE_BREAK}`;
export const SEMICOLON_SEPARATOR = ";";

export const PARAGRAPH_SPLIT = /\n{2,}/;
export const REPEATED_SPACES = / {2,}/g;
export const PARENTHETICAL = /\s?\(\w+\)/;

const EM_DASH_CODE_POINT = 0x2014;

export const NO_VALUE = String.fromCodePoint(EM_DASH_CODE_POINT);

export function isText(value: unknown): value is string {
  return typeof value === "string";
}

export function textOrEmpty(value: unknown): string {
  return isText(value) ? value : EMPTY_TEXT;
}

export function nonEmptyText(value: unknown): string | undefined {
  return isText(value) && value.length > 0 ? value : undefined;
}

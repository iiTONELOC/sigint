import { gunzipText, gzipText } from "../src/shared/http";

enum CsvDelimiter {
  Field = ",",
  DoubleQuote = '"',
  SingleQuote = "'",
}

const SURROUNDING_QUOTES = /^['"]|['"]$/g;
const GZIP_FILE_SUFFIX = ".gz";

type CsvQuote = CsvDelimiter.DoubleQuote | CsvDelimiter.SingleQuote;

function isCsvQuote(character: string): character is CsvQuote {
  return character === CsvDelimiter.DoubleQuote || character === CsvDelimiter.SingleQuote;
}

/** Split one CSV line, honoring quoted fields and doubled quotes. */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let quote: CsvQuote | null = null;
  for (let index = 0; index < line.length; index++) {
    const character = line.charAt(index);
    if (quote === null && isCsvQuote(character)) {
      quote = character;
    } else if (quote !== null && character === quote) {
      if (line.charAt(index + 1) === quote) {
        field += quote;
        index++;
      } else {
        quote = null;
      }
    } else if (quote === null && character === CsvDelimiter.Field) {
      fields.push(field);
      field = "";
    } else {
      field += character;
    }
  }
  fields.push(field);
  return fields.map((value) => value.trim().replace(SURROUNDING_QUOTES, ""));
}

/** Gzip a value as JSON and write it; returns the bytes written. */
export async function writeGzipJson(path: string, value: unknown): Promise<number> {
  return Bun.write(path, await gzipText(JSON.stringify(value)));
}

/** Read a text file, gunzipping it when its name ends in `.gz`. */
export async function readTextFile(path: string): Promise<string> {
  const file = Bun.file(path);
  if (!path.endsWith(GZIP_FILE_SUFFIX)) return file.text();
  return gunzipText(file.stream());
}

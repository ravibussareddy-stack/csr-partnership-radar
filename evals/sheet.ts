/** The labelling sheet's columns and CSV helpers (shared by export-sheet.ts and score.ts). */
import { parse } from "csv-parse/sync";

export const SHEET_COLUMNS = [
  "item_id", "date", "company", "title", "url", "source", "summary",
  "system_tier", "system_call_type", "system_reason",
  "label_tier", "label_call_type", "label_notes",
] as const;

export type SheetRow = Record<(typeof SHEET_COLUMNS)[number], string>;

const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function toCsv(rows: SheetRow[]): string {
  return [SHEET_COLUMNS.join(","), ...rows.map((r) => SHEET_COLUMNS.map((c) => cell(r[c] ?? "")).join(","))].join("\n") + "\n";
}

/** Reads a sheet saved by Excel / Google Sheets too (BOM, CRLF, extra or reordered columns). */
export function fromCsv(text: string): SheetRow[] {
  const records = parse(text, { columns: true, bom: true, skip_empty_lines: true, relax_column_count: true, trim: true }) as Record<string, string>[];
  return records.map((r) => Object.fromEntries(SHEET_COLUMNS.map((c) => [c, r[c] ?? ""])) as SheetRow);
}

import { strFromU8, unzipSync } from "fflate";

/** Minimal XLSX reader: literal values only (formulas yield their cached value), no styles. */

export type XlsxCell = string | number | boolean | null;

export interface XlsxRow {
  /** Real 1-based Excel row number. */
  rowNumber: number;
  /** Indexed by column, A = 0. */
  cells: XlsxCell[];
}

export interface XlsxSheet {
  name: string;
  rows: XlsxRow[];
}

export interface XlsxWorkbook {
  sheets: XlsxSheet[];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] !== "#") return ENTITIES[entity.toLowerCase()] ?? match;
    const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

function attributes(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1]] = decodeXml(m[2] ?? m[3] ?? "");
  return out;
}

/** Concatenated text of all <t> elements (plain and rich-text runs), ignoring phonetic runs. */
function textContent(xml: string): string {
  let text = "";
  for (const m of xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t(?:\s[^>]*?)?(?<!\/)>([\s\S]*?)<\/t>/g)) text += decodeXml(m[1]);
  return text;
}

function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.toUpperCase()) {
    const code = ch.charCodeAt(0);
    if (code < 65 || code > 90) break;
    n = n * 26 + (code - 64);
  }
  return n - 1;
}

function resolveTarget(target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts: string[] = ["xl"];
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

function parseSheet(xml: string, name: string, shared: string[]): XlsxSheet {
  const rows: XlsxRow[] = [];
  let lastRow = 0;
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNumber = Number(attributes(rm[1]).r) || lastRow + 1;
    lastRow = rowNumber;
    const cells: XlsxCell[] = [];
    let lastCol = -1;
    for (const cm of (rm[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = attributes(cm[1]);
      const col = attrs.r ? columnIndex(attrs.r) : lastCol + 1;
      lastCol = col;
      const body = cm[2] ?? "";
      const raw = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1];
      let value: XlsxCell = null;
      switch (attrs.t) {
        case "s":
          value = raw === undefined ? null : (shared[Number(raw)] ?? null);
          break;
        case "inlineStr":
          value = textContent(body.match(/<is\b[^>]*>([\s\S]*?)<\/is>/)?.[1] ?? "");
          break;
        case "b":
          value = raw === undefined ? null : raw.trim() === "1";
          break;
        case "str":
        case "e":
        case "d":
          value = raw === undefined ? null : decodeXml(raw);
          break;
        default:
          if (raw !== undefined && raw.trim() !== "") {
            const n = Number(raw);
            value = Number.isFinite(n) ? n : decodeXml(raw);
          }
      }
      if (value === null || value === "") continue;
      while (cells.length < col) cells.push(null);
      cells[col] = value;
    }
    if (cells.length > 0) rows.push({ rowNumber, cells });
  }
  return { name, rows };
}

/** Read an .xlsx file. Throws if the data is not a zip archive. */
export function readXlsx(data: Uint8Array): XlsxWorkbook {
  const files = unzipSync(data, { filter: (f) => /\.(xml|rels)$/i.test(f.name) });
  const read = (p: string) => (files[p] ? strFromU8(files[p]) : "");

  const shared = [...read("xl/sharedStrings.xml").matchAll(/<si\b[^>]*\/>|<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) =>
    textContent(m[1] ?? ""),
  );

  const targets = new Map<string, string>();
  for (const m of read("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const a = attributes(m[1]);
    if (a.Id && a.Target) targets.set(a.Id, resolveTarget(a.Target));
  }

  const sheets: XlsxSheet[] = [];
  const sheetTags = [...read("xl/workbook.xml").matchAll(/<sheet\b([^>]*?)\/?>/g)];
  sheetTags.forEach((m, i) => {
    const a = attributes(m[1]);
    const relId = Object.entries(a).find(([k]) => /(^|:)id$/.test(k))?.[1];
    const part = (relId && targets.get(relId)) || `xl/worksheets/sheet${i + 1}.xml`;
    sheets.push(parseSheet(read(part), a.name ?? `Sheet${i + 1}`, shared));
  });
  return { sheets };
}

const renderCell = (v: XlsxCell) => (v === null ? "" : typeof v === "string" ? v.replace(/\s*\n\s*/g, " ").trim() : String(v));

/** Plain-text rendering of a sheet, one line per row: "12: label | value". */
export function sheetToText(sheet: XlsxSheet): string {
  const lines = sheet.rows
    .map((row) => ({ row, values: row.cells.map(renderCell).filter(Boolean) }))
    .filter((r) => r.values.length > 0)
    .map((r) => `${r.row.rowNumber}: ${r.values.join(" | ")}`);
  return [`### Sheet ${sheet.name}`, ...lines].join("\n");
}

export function workbookToText(workbook: XlsxWorkbook): string {
  return workbook.sheets.map(sheetToText).join("\n\n");
}

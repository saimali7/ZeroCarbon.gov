import type { EvidenceRef, IsoDate, SubmissionDocument } from "@zerocarbon/shared";
import type { PageText } from "../types.ts";

/** One PDF document with its pages joined into a single string (offsets map back to pages). */
export interface DocText {
  document: SubmissionDocument;
  pages: PageText[];
  text: string;
  /** Offset of each page in `text`. */
  starts: number[];
  lines: Line[];
}

export interface Line {
  text: string;
  start: number;
  end: number;
}

export interface Hit {
  m: RegExpExecArray;
  start: number;
  end: number;
  offset: number;
}

export interface Heading {
  number: string;
  title: string;
  start: number;
  end: number;
}

export const QUOTE_MAX = 200;

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = String.raw`(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)`;
const MONTH_RE = new RegExp(`^${MONTH}$`);

/** A date as written in documents ("18 January 2025", "12-Feb-2025", "2025-02-12", "18/01/2025"). Use with the "i" flag. */
export const DATE = String.raw`(?:\d{1,2}(?:st|nd|rd|th)?[\s\-.\/]*${MONTH}\.?[\s\-.\/,]*\d{4}|${MONTH}\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[\/.]\d{1,2}[\/.]\d{4})`;
/** A document identifier containing at least one digit, e.g. "GCS-CAL-25-0117", "DEC/SDF/HSE/2026/0330". */
export const ID = String.raw`[A-Z0-9][A-Z0-9\-\/_.]*\d[A-Z0-9\-\/_]*`;

export function buildDoc(document: SubmissionDocument, pages: PageText[]): DocText {
  const sorted = [...pages].sort((a, b) => a.page - b.page);
  const starts: number[] = [];
  const lines: Line[] = [];
  let text = "";
  for (const p of sorted) {
    if (starts.length) text += "\n";
    starts.push(text.length);
    let offset = text.length;
    for (const l of (p.text ?? "").split("\n")) {
      lines.push({ text: l, start: offset, end: offset + l.length });
      offset += l.length + 1;
    }
    text += p.text ?? "";
  }
  return { document, pages: sorted, text, starts, lines };
}

export function pageIndex(doc: DocText, offset: number): number {
  let i = 0;
  while (i + 1 < doc.starts.length && doc.starts[i + 1] <= offset) i++;
  return i;
}

function pageBounds(doc: DocText, offset: number): [number, number] {
  const i = pageIndex(doc, offset);
  return [doc.starts[i], doc.starts[i] + (doc.pages[i]?.text.length ?? 0)];
}

function withFlags(re: RegExp, add: string): RegExp {
  return new RegExp(re.source, [...new Set(re.flags + add)].join(""));
}

/** First match of `re` in doc.text[from, to). Offsets in the result are absolute. */
export function find(doc: DocText, re: RegExp, from = 0, to = doc.text.length): Hit | undefined {
  const m = withFlags(re, "d").exec(doc.text.slice(from, to));
  return m ? { m, start: from + m.index, end: from + m.index + m[0].length, offset: from } : undefined;
}

export function findAll(doc: DocText, re: RegExp, from = 0, to = doc.text.length): Hit[] {
  return [...doc.text.slice(from, to).matchAll(withFlags(re, "gd"))].map((m) => {
    const start = from + (m.index ?? 0);
    return { m: m as RegExpExecArray, start, end: start + m[0].length, offset: from };
  });
}

export const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

export function clip(s: string, max = QUOTE_MAX): string {
  if (s.length <= max) return s;
  const cut = s.lastIndexOf(" ", max);
  return s.slice(0, cut > max * 0.6 ? cut : max).trimEnd();
}

export function evidenceRef(doc: DocText, page: number, quote: string): EvidenceRef {
  return { documentId: doc.document.id, fileName: doc.document.fileName, page, locator: `Page ${page}`, quote: clip(collapse(quote)) };
}

/** Evidence for doc.text[start, end), clipped to the page where it starts. */
export function ref(doc: DocText, start: number, end: number): EvidenceRef {
  const i = pageIndex(doc, start);
  const [, pageEnd] = pageBounds(doc, start);
  return evidenceRef(doc, doc.pages[i].page, doc.text.slice(start, Math.min(end, pageEnd)));
}

export function dedupeRefs(refs: EvidenceRef[]): EvidenceRef[] {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const key = `${r.documentId}|${r.page}|${r.quote}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });
}

const isStop = (t: string, j: number) => /[.!?]/.test(t[j]) && (j + 1 >= t.length || /\s/.test(t[j + 1]));
const isBreak = (t: string, j: number) => t[j] === "\n" && t[j + 1] === "\n";

export interface SpanOptions {
  floor?: number;
  ceil?: number;
  /** Extra sentences to include after the one containing the match. */
  follow?: number;
  /** Extra sentences to include before (only in `textStart`). */
  before?: number;
  /** Use whole lines instead of sentences (tables, labels). */
  line?: boolean;
  /** Longest sentence accepted before falling back to lines. */
  max?: number;
}

/**
 * Expand a match to the sentence containing it, bounded by the page and optional floor/ceil
 * (e.g. the section). `start` is where the quote should begin, `textStart` includes `before` sentences.
 */
export function sentenceSpan(doc: DocText, start: number, end: number, o: SpanOptions = {}) {
  const t = doc.text;
  const [pageStart, pageEnd] = pageBounds(doc, start);
  const floor = Math.max(pageStart, o.floor ?? 0);
  const ceil = Math.min(pageEnd, o.ceil ?? Infinity);
  const skipWs = (i: number) => {
    while (i < ceil && /\s/.test(t[i])) i++;
    return i;
  };
  const back = (from: number) => {
    let j = from - 1;
    while (j >= floor && !isStop(t, j) && !isBreak(t, j)) j--;
    return skipWs(Math.max(j + 1, floor));
  };
  const lineSpan = () => {
    const s = Math.max(floor, t.lastIndexOf("\n", start - 1) + 1);
    const nl = t.indexOf("\n", Math.max(start, end - 1));
    return { start: s, end: nl < 0 || nl > ceil ? ceil : nl, textStart: s };
  };
  if (o.line) return lineSpan();
  const s = back(start);
  let e = -1;
  let brk = ceil;
  let follow = o.follow ?? 0;
  for (let j = Math.max(start, end - 1); j < ceil; j++) {
    if (isBreak(t, j) && j >= end) {
      brk = j;
      break;
    }
    if (!isStop(t, j)) continue;
    e = j + 1;
    if (follow-- <= 0) break;
  }
  if (e < 0) e = brk;
  const firstEnd = t.slice(s, e).search(/[.!?](\s|$)/);
  if ((firstEnd < 0 ? e - s : firstEnd) > (o.max ?? 320)) return lineSpan();
  let textStart = s;
  for (let k = 0; k < (o.before ?? 0) && textStart > floor; k++) {
    let j = textStart - 1;
    while (j > floor && /\s/.test(t[j])) j--;
    textStart = back(j);
  }
  return { start: s, end: e, textStart };
}

/** Numbered section headings ("6.3 Other methane sources"), strictly increasing through the document. */
export function headings(doc: DocText): Heading[] {
  const out: Heading[] = [];
  let prev: number[] = [];
  for (const l of doc.lines) {
    const m = /^\s*(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+([A-Z][^\n]{2,90})$/.exec(l.text);
    if (!m || !/[a-z]{3}/.test(m[2])) continue;
    const num = m[1].split(".").map(Number);
    if (!isAfter(num, prev) || num[0] - (prev[0] ?? 0) > 3) continue;
    out.push({ number: m[1], title: m[2].trim(), start: l.start, end: l.end });
    prev = num;
  }
  return out;
}

function isAfter(a: number[], b: number[]): boolean {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? -1;
    const y = b[i] ?? -1;
    if (x !== y) return x > y;
  }
  return false;
}

/** Bounds of the section containing `offset`: [heading end, next heading start]. */
export function sectionAt(hs: Heading[], offset: number, docEnd: number) {
  let i = -1;
  while (i + 1 < hs.length && hs[i + 1].start <= offset) i++;
  return i < 0
    ? { heading: undefined, floor: 0, ceil: hs[0]?.start ?? docEnd }
    : { heading: hs[i], floor: hs[i].end, ceil: hs[i + 1]?.start ?? docEnd };
}

export function parseDate(input: unknown): IsoDate | undefined {
  if (typeof input !== "string") return;
  const s = input.trim().toLowerCase().replace(/\s+/g, " ");
  let y: number, m: number, d: number;
  let r: RegExpMatchArray | null;
  if ((r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|t|\s)/))) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-.\/]*([a-z]{3,9})\.?[\s\-.\/,]*(\d{4})$/))) [d, m, y] = [+r[1], monthNo(r[2]), +r[3]];
  else if ((r = s.match(/^([a-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?,? (\d{4})$/))) [m, d, y] = [monthNo(r[1]), +r[2], +r[3]];
  else if ((r = s.match(/^(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})$/))) [d, m, y] = [+r[1], +r[2], +r[3]];
  else return;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (!m || y < 1900 || y > 2200 || dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return;
  return dt.toISOString().slice(0, 10);
}

function monthNo(name: string): number {
  return MONTH_RE.test(name) ? MONTH_NAMES.indexOf(name.slice(0, 3)) + 1 : 0;
}

export function parseNum(input: unknown): number | undefined {
  if (typeof input === "number") return Number.isFinite(input) ? input : undefined;
  if (typeof input !== "string") return;
  const m = input.replace(/(\d)[,\s\u202f](?=\d{3}(?!\d))/g, "$1").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : undefined;
}

/** Numbers in a table row, e.g. "56.99 56.96 57.00 56.89 56.96". */
export function rowNumbers(s: string): number[] {
  return [...s.matchAll(/(?<![\w.,])-?\d[\d,]*(?:\.\d+)?(?![\w.])/g)].map((m) => parseNum(m[0])).filter((n): n is number => n !== undefined);
}

/** Expand item ids and ranges: "M-04 to M-08" -> M-04, M-05, ..., M-08. */
export function expandIds(text: string, prefixes = "M|SS|ES"): string[] {
  const re = new RegExp(String.raw`\b(${prefixes})-(\d{1,3})\b(?:\s*(?:to|through|until|[–—-])\s*(?:\1-)?(\d{1,3})\b)?`, "gi");
  const ids: string[] = [];
  for (const [, p, a, b] of text.matchAll(re)) {
    const prefix = p.toUpperCase();
    const from = Number(a);
    const to = b ? Number(b) : from;
    if (to < from || to - from > 50) ids.push(`${prefix}-${a}`);
    else for (let n = from; n <= to; n++) ids.push(`${prefix}-${String(n).padStart(a.length, "0")}`);
  }
  return [...new Set(ids)];
}

export const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** "KESTREL Verification Services LLC" -> "Kestrel Verification Services LLC" (keeps short acronyms). */
export const titleCaps = (s: string) => collapse(s).replace(/\b[A-Z]{4,}\b/g, (w) => w[0] + w.slice(1).toLowerCase());

const FOLD: Record<string, string> = { "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "−": "-", "‐": "-", "‑": "-" };

/** Lower-case, whitespace-collapsed text with a map from each output char to its source index. */
function fold(s: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (/\s/.test(c)) {
      if (norm && !norm.endsWith(" ")) {
        norm += " ";
        map.push(i);
      }
      continue;
    }
    for (const f of (FOLD[c] ?? c).toLowerCase()) {
      norm += f;
      map.push(i);
    }
  }
  return { norm, map };
}

/**
 * Find a (possibly re-spaced, re-cased or elided with "...") quote in the page text.
 * Returns the verbatim page excerpt, or undefined when it is not there.
 */
export function locateQuote(pageText: string, quote: string): string | undefined {
  const parts = quote
    .normalize("NFKC")
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "")
    .split(/\s*(?:\.{3}|…)\s*/)
    .map((p) => fold(p).norm.trim())
    .filter(Boolean);
  if (!parts.length || parts.join("").length < 4) return;
  const { norm, map } = fold(pageText);
  let from = 0;
  let first = -1;
  let last = -1;
  for (const p of parts) {
    const i = norm.indexOf(p, from);
    if (i < 0) return;
    if (first < 0) first = i;
    last = i + p.length - 1;
    from = i + p.length;
  }
  return collapse(pageText.slice(map[first], map[last] + 1));
}

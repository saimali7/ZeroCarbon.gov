/** Pure helpers shared by the checks: number formatting, dates, text parsing. */
import type { IsoDate } from "@zerocarbon/shared";

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

const numberFormats = new Map<number, Intl.NumberFormat>();

export function round(value: number, digits = 0): number {
  const k = 10 ** digits;
  return Math.round(value * k) / k;
}

/** en-US number with thousands separators and a fixed number of decimals. */
export function fmt(value: number, digits = 0): string {
  let format = numberFormats.get(digits);
  if (!format) {
    format = new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    numberFormats.set(digits, format);
  }
  return format.format(round(value, digits) + 0);
}

export const fmtSignedPct = (pct: number, digits = 1) => `${round(pct, digits) > 0 ? "+" : ""}${fmt(pct, digits)}%`;

export const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

export const mean = (values: number[]) => (values.length ? sum(values) / values.length : NaN);

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Relative difference of `value` from `reference` (0.01 = 1% above). */
export const relDiff = (value: number, reference: number) =>
  reference === 0 ? (value === 0 ? 0 : Infinity) : (value - reference) / reference;

export const withinTolerance = (value: number, reference: number, relTol: number, absTol = 0) =>
  Math.abs(value - reference) <= Math.max(absTol, Math.abs(reference) * relTol);

/** Parses "25,050,372" or "3,585.6". */
export const parseNumber = (text: string) => Number(text.replace(/,/g, ""));

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export const clip = (text: string, max = 300) => (text.length <= max ? text : `${text.slice(0, max - 3).trimEnd()}...`);

/** Equipment and instrument tags such as "FT-5101", "T-401A/B", "V-210". Permit numbers ("PTW-25-0418") are excluded. */
const TAG_RE = /\b[A-Z]{1,4}-\d{2,5}[A-Z]?(?:\/[A-Z])*(?![\d-])/g;
const PERMIT_RE = /\b[A-Z]{2,5}-\d{2}-\d{3,5}\b/g;

export const extractTags = (text: string | undefined) => (text ? [...new Set(text.match(TAG_RE) ?? [])] : []);
export const extractPermits = (text: string | undefined) => (text ? [...new Set(text.match(PERMIT_RE) ?? [])] : []);

const tagBase = (tag: string) => tag.replace(/[A-Z]?(?:\/[A-Z])*$/, "");
/** True when two tag lists share equipment ("K-201A/B" matches "K-201B"). */
export const tagsOverlap = (a: string[], b: string[]) => a.some((x) => b.some((y) => x === y || tagBase(x) === tagBase(y)));

/** Data-source text that describes a non-measured value (estimate, substitution, model...). */
export const isEstimatedSource = (source: string | undefined) =>
  !!source && /estimat|substitut|calculat|assum|default|model|fallback|interpolat|missing|manual/i.test(source);

/** Short name of a source description: "Crude storage tanks T-401A/B (flashing...)" -> "Crude storage tanks T-401A/B". */
export const shortName = (text: string) => text.replace(/\s*\(.*$/, "").trim();

// ---------------------------------------------------------------------------
// Dates (ISO strings, UTC arithmetic)
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_PATTERN =
  "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";

const time = (date: IsoDate) => Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (year: number, month: number, day: number) => `${year}-${pad(month)}-${pad(day)}`;
const monthNo = (name: string) => MONTH_NAMES.findIndex((m) => m.toLowerCase() === name.slice(0, 3).toLowerCase()) + 1;

export const addDays = (date: IsoDate, days: number) => new Date(time(date) + days * DAY_MS).toISOString().slice(0, 10);
/** Whole days from `from` to `to`. */
export const daysBetween = (from: IsoDate, to: IsoDate) => Math.round((time(to) - time(from)) / DAY_MS);
export const monthEnd = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
export const nextMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
};

export const formatDate = (date: IsoDate) =>
  `${Number(date.slice(8, 10))} ${MONTH_NAMES[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
export const formatMonth = (month: string) => `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
export const formatDateRange = (from: IsoDate, to: IsoDate) =>
  from === to ? formatDate(from) : `${formatDate(from)} to ${formatDate(to)}`;
export function formatMonthRange(from: string, to: string): string {
  if (from === to) return formatMonth(from);
  const head = from.slice(0, 4) === to.slice(0, 4) ? MONTH_NAMES[Number(from.slice(5, 7)) - 1] : formatMonth(from);
  return `${head} to ${formatMonth(to)}`;
}

/**
 * Parses a declared period such as "11-13 Mar 2025 (3 days)", "1 June to 31 December 2025",
 * "2025-06-01 to 2025-12-31" or "Jun-Dec 2025". Returns undefined when no date can be read.
 */
export function parsePeriod(text: string, defaultYear: number): { start: IsoDate; end: IsoDate } | undefined {
  const iso = text.match(/\d{4}-\d{2}-\d{2}/g);
  if (iso) return { start: iso[0], end: iso[iso.length - 1] };

  const dayRe = new RegExp(`(\\d{1,2})(?:\\s*[-\u2013]\\s*(\\d{1,2}))?\\s+(${MONTH_PATTERN})\\b\\.?(?:\\s+(\\d{4}))?`, "gi");
  const tokens = [...text.matchAll(dayRe)];
  if (tokens.length) {
    const years = tokens.map((m) => (m[4] ? Number(m[4]) : undefined));
    const dates = tokens.flatMap((m, i) => {
      const year = years[i] ?? years.slice(i + 1).find((y) => y !== undefined) ?? defaultYear;
      const month = monthNo(m[3]);
      return [isoOf(year, month, Number(m[1])), ...(m[2] ? [isoOf(year, month, Number(m[2]))] : [])];
    });
    return { start: dates[0], end: dates[dates.length - 1] };
  }

  const months = [...text.matchAll(new RegExp(`\\b(${MONTH_PATTERN})\\b(?:\\s+(\\d{4}))?`, "gi"))];
  if (!months.length) return undefined;
  const years = months.map((m) => (m[2] ? Number(m[2]) : undefined));
  const monthOf = (i: number) => `${years[i] ?? years.slice(i + 1).find((y) => y !== undefined) ?? defaultYear}-${pad(monthNo(months[i][1]))}`;
  return { start: `${monthOf(0)}-01`, end: monthEnd(monthOf(months.length - 1)) };
}

/** "12:05-18:35" in free text, as minutes since midnight. */
export function parseTimeWindow(text: string): { from: number; to: number; text: string } | undefined {
  const m = text.match(/(\d{1,2}):(\d{2})\s*[-\u2013]\s*(\d{1,2}):(\d{2})/);
  if (!m) return undefined;
  return { from: Number(m[1]) * 60 + Number(m[2]), to: Number(m[3]) * 60 + Number(m[4]), text: `${m[1]}:${m[2]}-${m[3]}:${m[4]}` };
}

export const minutesOf = (hhmm: string) => {
  const m = hhmm.match(/(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : undefined;
};

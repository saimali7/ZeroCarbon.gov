import type { Finding, RegulationRule, Severity } from "@zerocarbon/shared";
import type { PageText } from "../types.ts";

export const warn = (message: string) => console.warn(`[ai] ${message}`);
export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

// ---------------------------------------------------------------------------
// Numbers and dates
// ---------------------------------------------------------------------------

export function fmtNum(n: number, maxDigits = 0, minDigits = 0): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: maxDigits, minimumFractionDigits: minDigits }).format(n);
}
/** Tonnes: whole numbers from 1,000 t, one decimal below. */
export const fmtT = (n: number) => fmtNum(n, Math.abs(n) >= 1000 ? 0 : 1);
export const fmtPct = (n: number, signed = false) => `${signed && n > 0 ? "+" : ""}${fmtNum(n, 1, 1)}%`;
export const fmtIntensity = (n: number) => fmtNum(n, 2);

export const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const AR_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

/** Today's calendar date in the UAE (GST, UTC+4), at 00:00 UTC. */
export function gstToday(now = new Date()): Date {
  const d = new Date(now.getTime() + 4 * 3_600_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
export const addDays = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);
export function parseIsoDate(value?: string): Date | undefined {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : undefined;
}
export const fmtDateEn = (d: Date) => `${d.getUTCDate()} ${EN_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
export const fmtDateAr = (d: Date) => `${d.getUTCDate()} ${AR_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

/** Arabic counted noun for days, e.g. "30 يوماً", "7 أيام". */
export function daysAr(n: number): string {
  if (n === 1) return "يوم واحد";
  if (n === 2) return "يومين";
  return n >= 3 && n <= 10 ? `${n} أيام` : `${n} يوماً`;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

export function firstSentence(text: string): string {
  const t = text.trim();
  const m = t.match(/^[\s\S]*?[.!?](?=\s+[A-Z(]|\s*$)/);
  return (m ? m[0] : t).trim();
}
export const ensurePeriod = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
export const stripPeriod = (s: string) => s.trim().replace(/[.!?]+$/, "");
export const lcFirst = (s: string) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
export const ucFirst = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
export const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 3).trimEnd()}...`);

/** "a", "a and b", "a, b and c" (or "a; b; and c" with sep "; "). */
export function joinEn(items: string[], sep = ", "): string {
  if (items.length <= 2) return items.join(" and ");
  return `${items.slice(0, -1).join(sep)}${sep.trim() === ";" ? "; and " : " and "}${items[items.length - 1]}`;
}
export const plural = (n: number, noun: string, many = `${noun}s`) => `${n} ${n === 1 ? noun : many}`;

export const hasArabic = (s: string) => /[\u0600-\u06FF]/.test(s);
export const toWesternDigits = (s: string) =>
  s.replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

/** Clean model text: Western digits, no em dashes, tidy blank lines. */
export const tidy = (s: string) =>
  toWesternDigits(s)
    .replace(/\s*\u2014\s*/g, " - ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const countNumbered = (body: string) => (body.match(/^\s*\d+[.)]\s+\S/gm) ?? []).length;

export const SEVERITY_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
export const bySeverity = (a: Finding, b: Finding) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
export const isActionable = (f: Finding) => (f.outcome === "breach" || f.outcome === "clarification") && f.severity !== "info";

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

export function normaliseForMatch(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Find a verbatim quote (whitespace and case normalised; "..." allowed between parts) in the pages, preferring `page`. */
export function findQuote(pages: PageText[] | undefined, quote: string, page?: number): { page: number } | undefined {
  if (!pages?.length) return undefined;
  const parts = normaliseForMatch(quote)
    .split(/\.{3}|\u2026/)
    .map((p) => p.trim().replace(/^["']|["']$/g, "").trim())
    .filter(Boolean);
  if (!parts.length || parts.join(" ").length < 12) return undefined;
  const ordered = [...pages].sort((a, b) => Number(b.page === page) - Number(a.page === page));
  for (const p of ordered) {
    const text = normaliseForMatch(p.text);
    const compact = text.replace(/\s+/g, "");
    if (parts.every((part) => text.includes(part) || compact.includes(part.replace(/\s+/g, "")))) return { page: p.page };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Numbers guard and rules
// ---------------------------------------------------------------------------

/** Numbers with 4+ integer digits in `text` that do not appear in `corpus` (thousands separators ignored). */
export function unknownNumbers(text: string, corpus: string): string[] {
  const known = corpus.replace(/(\d),(?=\d{3})/g, "$1");
  const out = new Set<string>();
  for (const m of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    const intPart = m[0].split(".")[0].replace(/,/g, "");
    if (intPart.length >= 4 && !known.includes(intPart)) out.add(m[0].replace(/,$/, ""));
  }
  return [...out];
}

export function guardNumbers(label: string, texts: string[], corpus: string): string[] {
  const unknown = unknownNumbers(texts.join("\n"), corpus);
  if (unknown.length) warn(`${label}: numbers not found in the input: ${unknown.join(", ")}`);
  return unknown;
}

export const ruleIndex = (rules: RegulationRule[]) => new Map(rules.map((r) => [r.id, r]));

/** Unique ids that exist in `rules`, in first-seen order. */
export function knownRuleIds(ids: Iterable<string>, rules: RegulationRule[]): string[] {
  const valid = new Set(rules.map((r) => r.id));
  return [...new Set([...ids].map((id) => id.trim()))].filter((id) => valid.has(id));
}

export const citationsEn = (ids: Iterable<string>, rules: RegulationRule[]) => {
  const index = ruleIndex(rules);
  return knownRuleIds(ids, rules).map((id) => index.get(id)!.citation);
};

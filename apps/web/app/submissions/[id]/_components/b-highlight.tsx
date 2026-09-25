import type { ReactNode } from "react";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Pattern for one phrase: case-insensitive, any run of whitespace between words, straight or curly quotes. */
function phraseSource(phrase: string): string | null {
  const words = phrase.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  return words
    .map((w) => escapeRegExp(w).replace(/['\u2019]/g, "['\u2019]").replace(/["\u201c\u201d]/g, '["\u201c\u201d]'))
    .join("\\s+");
}

/** One global pattern matching any of the phrases, or null when there is nothing to highlight. */
export function phrasesPattern(phrases: (string | undefined)[]): RegExp | null {
  const sources = phrases.map((p) => (p ? phraseSource(p) : null)).filter((s): s is string => Boolean(s));
  return sources.length ? new RegExp(sources.map((s) => `(?:${s})`).join("|"), "gi") : null;
}

/**
 * Pattern for a cited quote within a document: the full quote when it occurs in `haystack`,
 * otherwise its first six words (extracted PDF text often breaks long sentences differently).
 */
export function quotePattern(quote: string | undefined, haystack: string): { pattern: RegExp | null; match: "full" | "partial" | "none" } {
  if (!quote?.trim()) return { pattern: null, match: "none" };
  const full = phrasesPattern([quote]);
  if (full && haystack.search(full) >= 0) return { pattern: full, match: "full" };
  const words = quote.trim().split(/\s+/);
  if (words.length > 6) {
    const partial = phrasesPattern([words.slice(0, 6).join(" ")]);
    if (partial && haystack.search(partial) >= 0) return { pattern: partial, match: "partial" };
  }
  return { pattern: null, match: "none" };
}

/** Wraps every match of `pattern` in a gold <mark>, without shifting monospace layouts. */
export function highlight(text: string, pattern: RegExp | null): ReactNode {
  if (!pattern || !text) return text;
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    if (!m[0]) continue;
    const start = m.index;
    if (start > last) out.push(text.slice(last, start));
    out.push(
      <mark key={start} className="rounded-[2px] bg-gold-100 text-ink shadow-[0_0_0_2px_var(--color-gold-100)]">
        {m[0]}
      </mark>,
    );
    last = start + m[0].length;
  }
  if (!out.length) return text;
  if (last < text.length) out.push(text.slice(last));
  return out;
}

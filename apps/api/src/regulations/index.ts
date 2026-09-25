/**
 * Regulations corpus: the curated rules every finding must cite.
 *
 * The corpus lives in `apps/api/data/regulations.json`. It is read and validated once, on first use, and then served
 * from memory. Summaries are plain-language paraphrases, not the official text; each entry records its source URL and
 * whether it was checked against that source ("verified") or only against secondary material ("secondary").
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { RegulationRule } from "@zerocarbon/shared";

const CORPUS_URL = new URL("../../data/regulations.json", import.meta.url);

const RuleSchema = z.strictObject({
  id: z.string().regex(/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/, "ids are upper-case segments joined by hyphens"),
  citation: z.string().trim().min(1),
  title: z.string().trim().min(1),
  titleAr: z.string().trim().min(1).optional(),
  summary: z.string().trim().min(1),
  summaryAr: z.string().trim().min(1).optional(),
  instrument: z.string().trim().min(1),
  jurisdiction: z.enum(["UAE federal", "Abu Dhabi", "International"]),
  sourceUrl: z.string().regex(/^https:\/\/\S+$/, "sourceUrl must be an https URL"),
  sourceTitle: z.string().trim().min(1),
  confidence: z.enum(["verified", "secondary"]),
  tags: z.array(z.string().trim().min(1)),
}) satisfies z.ZodType<RegulationRule>;

const CorpusSchema = z.array(RuleSchema).min(1);

interface Corpus {
  rules: RegulationRule[];
  byId: Map<string, RegulationRule>;
}

let cached: Corpus | undefined;

function loadCorpus(): Corpus {
  const file = fileURLToPath(CORPUS_URL);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(CORPUS_URL, "utf8"));
  } catch (error) {
    throw new Error(`Could not read the regulations corpus at ${file}: ${(error as Error).message}`);
  }
  const parsed = CorpusSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid regulations corpus at ${file}:\n${z.prettifyError(parsed.error)}`);
  }
  const byId = new Map<string, RegulationRule>();
  for (const rule of parsed.data) {
    if (byId.has(rule.id)) throw new Error(`Duplicate rule id "${rule.id}" in ${file}`);
    // Shared, read-only objects: callers must not mutate the corpus.
    Object.freeze(rule.tags);
    Object.freeze(rule);
    byId.set(rule.id, rule);
  }
  return { rules: parsed.data, byId };
}

function corpus(): Corpus {
  cached ??= loadCorpus();
  return cached;
}

/** All rules, in corpus order. */
export function listRules(): RegulationRule[] {
  return corpus().rules.slice();
}

export function getRule(id: string): RegulationRule | undefined {
  return corpus().byId.get(id);
}

/** Rules for the given ids, in the order given. Unknown ids are skipped. */
export function getRules(ids: string[]): RegulationRule[] {
  const { byId } = corpus();
  const out: RegulationRule[] = [];
  for (const id of ids) {
    const rule = byId.get(id);
    if (rule) out.push(rule);
  }
  return out;
}

export function isKnownRule(id: string): boolean {
  return corpus().byId.has(id);
}

// ---------------------------------------------------------------------------
// Keyword search
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is", "it", "of", "on", "or", "the", "to",
  "with", "what", "which", "when", "must", "should", "does", "do",
]);

const WEIGHTS = { tags: 4, title: 3, titleAr: 3, citation: 2, summary: 1, summaryAr: 1 } as const;

type SearchFields = Record<keyof typeof WEIGHTS, string>;

const ARABIC_SCRIPT = /[\u0600-\u06FF]/;

function normalise(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

/** Words and numbers, keeping decimals such as "7.5" together. */
function tokenize(text: string): string[] {
  const tokens = normalise(text).match(/[\p{L}\p{N}]+(?:[.,/][\p{N}]+)*/gu) ?? [];
  return [...new Set(tokens.filter((t) => !STOP_WORDS.has(t) && (t.length > 1 || /\p{N}/u.test(t))))];
}

/**
 * How a query term matches field text. Arabic terms match anywhere (Arabic attaches prefixes such as "ال" and "و" to
 * words). Latin terms match at the start of a word ("gap" matches "gaps"); very short terms must match a whole word.
 */
function termMatcher(term: string): (text: string) => boolean {
  if (ARABIC_SCRIPT.test(term)) return (text) => text.includes(term);
  const escaped = term.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const tail = term.length <= 2 ? "(?![\\p{L}\\p{N}])" : "";
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}${tail}`, "u");
  return (text) => pattern.test(text);
}

function fieldsOf(rule: RegulationRule): SearchFields {
  return {
    tags: normalise(rule.tags.join(" | ")),
    title: normalise(rule.title),
    titleAr: normalise(rule.titleAr ?? ""),
    citation: normalise(`${rule.id} ${rule.citation} ${rule.instrument}`),
    summary: normalise(rule.summary),
    summaryAr: normalise(rule.summaryAr ?? ""),
  };
}

function scoreRule(fields: SearchFields, phrase: string, matchers: ((text: string) => boolean)[]): number {
  let score = 0;
  let matched = 0;
  for (const matches of matchers) {
    let termScore = 0;
    for (const key of Object.keys(WEIGHTS) as (keyof SearchFields)[]) {
      if (matches(fields[key])) termScore += WEIGHTS[key];
    }
    if (termScore > 0) matched += 1;
    score += termScore;
  }
  if (matched === 0) return 0;
  // Reward rules that match the whole query as a phrase, and rules that match every term.
  if (matchers.length > 1) {
    if (fields.tags.includes(phrase) || fields.title.includes(phrase) || fields.titleAr.includes(phrase)) score += 6;
    else if (fields.summary.includes(phrase) || fields.summaryAr.includes(phrase)) score += 2;
    if (matched === matchers.length) score += 2;
  }
  return score;
}

/**
 * Simple case-insensitive keyword search over id, citation, title, summary, tags and the Arabic fields.
 * Returns at most `limit` rules, best match first (ties keep corpus order). An empty query returns no rules.
 */
export function searchRules(query: string, limit = 5): RegulationRule[] {
  const terms = tokenize(query);
  if (terms.length === 0 || limit <= 0) return [];
  const phrase = normalise(query).replace(/\s+/g, " ").trim();
  const matchers = terms.map(termMatcher);
  return corpus()
    .rules.map((rule, index) => ({ rule, index, score: scoreRule(fieldsOf(rule), phrase, matchers) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((hit) => hit.rule);
}

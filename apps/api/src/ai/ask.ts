import { z } from "zod";
import type { AskResponse, EvidenceRef, Finding, FindingCategory, Review } from "@zerocarbon/shared";
import type { AiContext, AskInput, SubmissionPackage } from "../types.ts";
import {
  bySeverity,
  citationsEn,
  clip,
  ensurePeriod,
  errorMessage,
  findQuote,
  fmtIntensity,
  fmtPct,
  fmtT,
  guardNumbers,
  knownRuleIds,
  ruleIndex,
  SEVERITY_RANK,
  stripPeriod,
  tidy,
  warn,
} from "./format.ts";
import { ASK_SYSTEM, compactReview, compactRules, jsonMessage, reportDigest } from "./prompts.ts";
import { nextStep } from "./templates/narrative.ts";
import { benchmarkSentence, trendSentence } from "./templates/phrases.ts";

export const AskSchema = z.object({
  answer: z.string(),
  citations: z.array(z.object({ documentId: z.string(), locator: z.string().nullable(), page: z.number().nullable(), quote: z.string().nullable() })),
  ruleIds: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Keyword retrieval over PDF pages
// ---------------------------------------------------------------------------

const STOP = new Set(
  "the and for are was were been this that these those what why how when where which who does did has have had with from about into than then there their them they its can could should would will may might not yes please tell show explain give list any all is it be do of to in on or an as at by".split(
    " ",
  ),
);

const stem = (w: string) => (w.length > 4 ? w.replace(/(ing|ed|es|s|e)$/, "") : w).slice(0, 6);

export function queryTerms(question: string): string[] {
  const ids = (question.match(/\b[A-Za-z]{1,4}-\d{1,5}[A-Za-z]?\b/g) ?? []).map((s) => s.toLowerCase());
  const words = (question.toLowerCase().match(/[a-z][a-z0-9]{2,}/g) ?? []).filter((w) => !STOP.has(w)).map(stem);
  return [...new Set([...ids, ...words])];
}

export interface Excerpt {
  documentId: string;
  fileName: string;
  page: number;
  text: string;
}

function occurrences(text: string, term: string, cap: number): number {
  let n = 0;
  for (let i = text.indexOf(term); i >= 0 && n < cap; i = text.indexOf(term, i + term.length)) n++;
  return n;
}

/** Most relevant PDF page excerpts for a question (IDF-weighted keyword match), capped in size. */
export function retrieveExcerpts(pkg: SubmissionPackage | undefined, question: string, maxPages = 4, maxChars = 6000): Excerpt[] {
  const terms = queryTerms(question);
  if (!pkg || !terms.length) return [];
  const names = new Map(pkg.documents.map((d) => [d.id, d.fileName]));
  const pages = Object.entries(pkg.pdfText).flatMap(([documentId, list]) =>
    list.map((p) => ({ documentId, page: p.page, text: p.text, lower: p.text.toLowerCase() })),
  );
  const df = new Map(terms.map((t) => [t, pages.filter((p) => p.lower.includes(t)).length]));
  const scored = pages
    .map((p) => {
      let score = 0;
      let first = -1;
      for (const t of terms) {
        const count = df.get(t) ? occurrences(p.lower, t, 5) : 0;
        if (!count) continue;
        score += count * Math.log(1 + pages.length / df.get(t)!);
        const at = p.lower.indexOf(t);
        if (first < 0 || at < first) first = at;
      }
      return { ...p, score, first };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score);
  const out: Excerpt[] = [];
  let used = 0;
  for (const p of scored.slice(0, maxPages)) {
    const budget = Math.min(1500, maxChars - used);
    if (budget < 200) break;
    const start = p.text.length <= budget ? 0 : Math.max(0, Math.min(p.first - 300, p.text.length - budget));
    const text = p.text.slice(start, start + budget).trim();
    out.push({ documentId: p.documentId, fileName: names.get(p.documentId) ?? p.documentId, page: p.page, text });
    used += text.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Offline answers
// ---------------------------------------------------------------------------

interface Topic {
  id: "flare" | "methane" | "satellite" | "verification" | "factor" | "gap" | "declaration" | "deadline" | "benchmark" | "trend" | "completeness" | "calculation" | "penalty" | "impact" | "status";
  re: RegExp;
  categories: FindingCategory[];
}

const TOPICS: Topic[] = [
  { id: "flare", re: /\bflar|gas balance|ft-?510\d|pilot|flame/i, categories: ["evidence", "data_gap"] },
  { id: "methane", re: /methane|\bch4\b|\bvent|\btanks?\b|fugitive|pneumatic|\bseals?\b|\bteg\b|ldar|de minimis/i, categories: ["methane"] },
  { id: "satellite", re: /satellite|plume|detection|overpass|signal/i, categories: ["satellite"] },
  { id: "verification", re: /verif|opinion|qualified|assurance/i, categories: ["verification"] },
  { id: "factor", re: /emission factor|\bef\b|factor|\bncv\b|calorific|gas analysis|laborator|\blab\b/i, categories: ["emission_factor"] },
  { id: "gap", re: /data gap|\bgaps?\b|calibrat|substitut|estimat|\bmeters?\b/i, categories: ["data_gap"] },
  { id: "declaration", re: /declar|cover letter|signed/i, categories: ["declaration", "verification"] },
  { id: "deadline", re: /deadline|\blate\b|due date|on time|grace|submission date|respond|response|reply|how long/i, categories: ["deadline"] },
  { id: "benchmark", re: /intensity|\bpeers?\b|benchmark|median|per barrel|\bboe\b|compar/i, categories: ["benchmark"] },
  { id: "trend", re: /trend|prior year|previous year|last year|year.on.year|\byoy\b|declin|decreas|\bdrop/i, categories: ["trend"] },
  { id: "completeness", re: /complete|missing|omit|exclud/i, categories: ["completeness", "methane"] },
  { id: "calculation", re: /calculat|arithmetic|recompute/i, categories: ["calculation"] },
  { id: "penalty", re: /penalt|\bfines?\b|sanction|enforce|legal|exposure|\baed\b|art(?:icle|\.)?\s*1[56]/i, categories: [] },
  { id: "impact", re: /how much|under-?report|unreported|impact|corrected|\btotal\b/i, categories: [] },
  { id: "status", re: /status|risk|complian|recommend|next step|what should|decision|\baction\b|overall|summar/i, categories: [] },
];

const OUTCOME_LABEL: Record<Finding["outcome"], string> = { breach: "breach", clarification: "needs clarification", signal: "signal, not proof" };
const STATUS_LABEL: Record<Review["status"], string> = { non_compliant: "Non-compliant", needs_clarification: "Needs clarification", compliant: "Compliant" };

function findingParagraph(f: Finding, input: AskInput): string {
  const ev = f.evidence.slice(0, 3).map((e) => (e.locator && e.locator !== e.fileName ? `${e.fileName} (${e.locator})` : e.fileName));
  const cites = citationsEn(f.ruleIds, input.rules);
  return [
    `${stripPeriod(f.title)} (${f.id}, ${f.severity}, ${OUTCOME_LABEL[f.outcome]}): ${ensurePeriod(f.summary)}`,
    f.impact && f.impact.tco2e > 0 ? `Estimated impact: about ${fmtT(f.impact.tco2e)} t CO2e.` : "",
    ev.length ? `Evidence: ${ev.join("; ")}.` : "",
    cites.length ? `Rules: ${cites.join("; ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function statusLine(r: Review): string {
  return `${STATUS_LABEL[r.status]}, risk score ${r.riskScore} out of 100 (${r.riskBand}). Recommended action: ${nextStep(r.recommendedAction)}.`;
}

function topicParagraphs(topics: Set<Topic["id"]>, review: Review, input: AskInput, ruleIds: string[]): string[] {
  const m = review.metrics;
  const out: string[] = [];
  if (topics.has("status")) {
    out.push(`${statusLine(review)} ${ensurePeriod(review.recommendedAction.rationale)}`);
    ruleIds.push(...review.recommendedAction.ruleIds);
  }
  if (topics.has("impact")) {
    if (m.estimatedUnderReportingTco2e > 0) {
      const parts = review.findings.filter((f) => f.impact?.countsTowardTotal && f.impact.tco2e > 0);
      out.push(
        `The review estimates that about ${fmtT(m.estimatedUnderReportingTco2e)} t CO2e (${fmtPct(m.estimatedUnderReportingPct)}) was not reported, so the corrected total would be about ${fmtT(m.correctedTotalTco2e)} t CO2e against ${fmtT(m.reportedTotalTco2e)} t CO2e reported.${parts.length ? ` Contributing findings: ${parts.map((f) => `${stripPeriod(f.title)} (${f.id}, about ${fmtT(f.impact!.tco2e)} t CO2e)`).join("; ")}.` : ""}`,
      );
    } else out.push(`The review did not estimate any unreported emissions. Reported total: ${fmtT(m.reportedTotalTco2e)} t CO2e.`);
  }
  if (topics.has("penalty")) {
    const index = ruleIndex(input.rules);
    const exposure = review.legalExposure;
    const ids = exposure?.ruleIds.length ? exposure.ruleIds : ["DL11-2024-ART15", "DL11-2024-ART16"];
    const rules = knownRuleIds(ids, input.rules).map((id) => index.get(id)!);
    const text = exposure?.text ?? rules.map((r) => `${r.citation}: ${ensurePeriod(r.summary)}`).join(" ");
    out.push(`${text ? `${ensurePeriod(text)} ` : ""}Fines under the Decree-Law are imposed by the courts, not automatically, and the officer decides whether to refer the case.`);
    ruleIds.push(...rules.map((r) => r.id));
  }
  if (topics.has("benchmark")) {
    const s = benchmarkSentence(m);
    if (s) {
      const pct = m.intensityPercentile != null ? ` ${fmtT(m.intensityPercentile)}% of peers report a lower intensity.` : "";
      const corrected =
        m.correctedIntensityKgCo2ePerBoe != null && m.estimatedUnderReportingTco2e > 0
          ? ` Corrected for the estimated under-reporting, it would be about ${fmtIntensity(m.correctedIntensityKgCo2ePerBoe)} kg CO2e/boe.`
          : "";
      out.push(`${s.en}.${pct}${corrected} Peer comparisons are signals to investigate, not proof.`);
    }
  }
  if (topics.has("trend")) {
    const s = trendSentence(m);
    if (s) out.push(`${s.en}${m.priorYearTotalTco2e != null ? ` (prior year ${fmtT(m.priorYearTotalTco2e)} t CO2e)` : ""}.`);
  }
  if (topics.has("deadline") && review.recommendedAction.responseDays)
    out.push(`If a query is sent, the recommended response period for the operator is ${review.recommendedAction.responseDays} days.`);
  return out;
}

export function offlineAnswer(input: AskInput): AskResponse {
  const { review } = input;
  if (!review) {
    const r = input.pkg?.report;
    return {
      answer: `This submission has not been reviewed yet, so there are no findings to answer from. Run the review first.${r ? ` The report states total emissions of ${fmtT(r.totals.totalCo2eT)} t CO2e for ${r.reportingYear}.` : ""}`,
      citations: [],
      ruleIds: [],
      source: "offline",
    };
  }
  const topics = TOPICS.filter((t) => t.re.test(input.question));
  const cats = new Set(topics.flatMap((t) => t.categories));
  const terms = queryTerms(input.question);
  const text = (f: Finding) => `${f.id} ${f.title} ${f.summary} ${f.details.join(" ")}`.toLowerCase();
  const picked = review.findings
    .map((f, i) => ({ f, i, score: (cats.has(f.category) ? 3 : 0) + terms.filter((t) => text(f).includes(t)).length }))
    .filter((s) => s.score >= (cats.size ? 3 : 2))
    .sort((a, b) => b.score - a.score || SEVERITY_RANK[b.f.severity] - SEVERITY_RANK[a.f.severity] || a.i - b.i)
    .slice(0, 3)
    .map((s) => s.f);

  const ruleIds: string[] = [];
  const paragraphs = topicParagraphs(new Set(topics.map((t) => t.id)), review, input, ruleIds);
  for (const f of picked) {
    paragraphs.push(findingParagraph(f, input));
    ruleIds.push(...f.ruleIds);
  }
  const coveredCats = new Set(picked.map((f) => f.category));
  const checks = review.checks.filter((c) => cats.has(c.category) && !coveredCats.has(c.category)).slice(0, 3);
  if (checks.length && !picked.length) paragraphs.push(checks.map((c) => `${stripPeriod(c.title)}: ${ensurePeriod(c.message)}`).join(" "));

  let citations = picked.flatMap((f) => f.evidence);
  if (!paragraphs.length) {
    const top = review.findings.filter((f) => f.severity !== "info").sort(bySeverity).slice(0, 3);
    paragraphs.push(
      `Live AI is off, so questions are answered by matching them to the review findings, and this question did not match a specific finding or metric. ${statusLine(review)}`,
      top.length
        ? `The main findings are:\n${top.map((f, i) => `${i + 1}. ${stripPeriod(f.title)} (${f.id}): ${ensurePeriod(f.summary)}`).join("\n")}`
        : "No findings were raised for this submission.",
    );
    citations = top.flatMap((f) => f.evidence.slice(0, 1));
  }
  return { answer: paragraphs.join("\n\n"), citations: dedupeEvidence(citations).slice(0, 6), ruleIds: knownRuleIds(ruleIds, input.rules), source: "offline" };
}

function dedupeEvidence(list: EvidenceRef[]): EvidenceRef[] {
  const seen = new Set<string>();
  return list.filter((e) => {
    const key = `${e.documentId}|${e.locator}|${e.page ?? ""}`;
    return seen.has(key) ? false : (seen.add(key), true);
  });
}

// ---------------------------------------------------------------------------
// Live answers
// ---------------------------------------------------------------------------

function knownDocuments(input: AskInput): Map<string, { fileName: string; pageCount?: number }> {
  const docs = new Map<string, { fileName: string; pageCount?: number }>();
  for (const f of input.review?.findings ?? []) for (const e of f.evidence) docs.set(e.documentId, { fileName: e.fileName });
  for (const d of input.pkg?.documents ?? []) docs.set(d.id, { fileName: d.fileName, pageCount: d.pageCount });
  return docs;
}

export function buildAskContext(input: AskInput, maxChars = 40_000) {
  const docs = knownDocuments(input);
  let ctx = {
    facility: input.identity,
    review: input.review ? compactReview(input.review) : null,
    report: input.pkg?.report ? reportDigest(input.pkg.report) : null,
    documents: [...docs].map(([id, d]) => ({ id, fileName: d.fileName, ...(d.pageCount ? { pageCount: d.pageCount } : {}) })),
    excerpts: retrieveExcerpts(input.pkg, input.question),
    rules: compactRules(input.rules),
  };
  if (JSON.stringify(ctx).length > maxChars && input.review) ctx = { ...ctx, review: compactReview(input.review, 2) };
  while (JSON.stringify(ctx).length > maxChars && ctx.excerpts.length) ctx = { ...ctx, excerpts: ctx.excerpts.slice(0, -1) };
  return ctx;
}

/** Keep citations that point to known documents; keep pages in range and quotes only when verified. */
export function cleanCitations(raw: z.infer<typeof AskSchema>["citations"], input: AskInput): EvidenceRef[] {
  const docs = knownDocuments(input);
  const out: EvidenceRef[] = [];
  for (const c of raw) {
    const documentId = c.documentId.trim();
    const doc = docs.get(documentId);
    if (!doc) continue;
    let page = c.page != null && Number.isInteger(c.page) && c.page >= 1 && (!doc.pageCount || c.page <= doc.pageCount) ? c.page : undefined;
    const hit = c.quote?.trim() ? findQuote(input.pkg?.pdfText[documentId], c.quote, page) : undefined;
    if (hit) page = hit.page;
    out.push({
      documentId,
      fileName: doc.fileName,
      locator: c.locator?.trim() || (page ? `Page ${page}` : doc.fileName),
      ...(page ? { page } : {}),
      ...(hit ? { quote: clip(c.quote!.trim(), 300) } : {}),
    });
  }
  return dedupeEvidence(out).slice(0, 8);
}

export async function answerQuestion(input: AskInput, ctx: AiContext): Promise<AskResponse> {
  if (ctx.mode !== "live" || !ctx.client) return offlineAnswer(input);
  try {
    const context = buildAskContext(input);
    const res = await ctx.client.chatJson({
      schema: AskSchema,
      schemaName: "grounded_answer",
      messages: [
        { role: "system", content: ASK_SYSTEM },
        { role: "user", content: `${jsonMessage("Context", context)}\n\nQuestion: ${input.question}` },
      ],
      temperature: 0.1,
      maxTokens: 1500,
    });
    const answer = tidy(res.data.answer);
    if (!answer) throw new Error("empty answer");
    const dropped = res.data.ruleIds.filter((id) => !input.rules.some((r) => r.id === id));
    if (dropped.length) warn(`ask: dropped unknown rule ids: ${dropped.join(", ")}`);
    guardNumbers("ask", [answer], JSON.stringify(context));
    return { answer, citations: cleanCitations(res.data.citations, input), ruleIds: knownRuleIds(res.data.ruleIds, input.rules), source: "llm", model: res.model };
  } catch (err) {
    warn(`ask: using offline answer (${errorMessage(err)})`);
    return offlineAnswer(input);
  }
}

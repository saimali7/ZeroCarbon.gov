import type { EmissionsReport, EvidenceRef, Finding, RegulationRule, Review } from "@zerocarbon/shared";
import { clip } from "./format.ts";
import { citationAr } from "./templates/phrases.ts";

const BASE = `You assist an officer of the Environment Agency - Abu Dhabi (EAD) who is reviewing a facility's annual greenhouse gas emissions report, submitted under UAE Federal Decree-Law No. 11 of 2024 and the EAD Technical Guidance for monitoring, reporting and verification (MRV).

Rules:
- Use ONLY the facts, numbers, evidence and rule ids in the user message. Never invent numbers, dates, rules, documents, people or events.
- Cite rule ids only from the "rules" list provided, and refer to rules by their citation text.
- Satellite detections, peer benchmarks and year-on-year trends are signals to investigate, not proof of a breach. Say so when you rely on them.
- Write neutral, precise, plain language for a busy officer. No speculation beyond the evidence, no marketing language, no em dashes.
- The officer makes every decision. Recommend; never state that a decision or penalty has been made.
- Numbers: copy them exactly as given (thousands separators and rounding to the precision shown are fine).

Legal points to get right:
- Decree-Law Art. 15 fines (AED 50,000 to 2,000,000 for breaching Art. 6(1)) are imposed by the courts: say the operator "may be exposed to" them "if not remedied".
- Art. 16 doubles the penalty only if the same act is repeated within two years of a previous final conviction.
- EAD TGD Step 6 favours written notices that set out the violation, the corrective action and a deadline.
- Third-party verification is voluntary until 2027. Never call it mandatory; the issue is declarations that contradict a verification statement.
- The operator's own Monitoring Plan (for example its substitution procedure) is the operator's commitment, not an EAD rule.`;

export const NARRATIVE_SYSTEM = `${BASE}

Task: write the review narrative as JSON.
- headline: one line, at most 120 characters, starting with the status, e.g. "Non-compliant: about X t CO2e (Y%) appears unreported" or "Compliant: X t CO2e reported, no material issues found".
- summary: 3 to 5 sentences for the officer: the status and risk score, the main problems, the estimated impact, and the recommended next step.
- explanations: one entry for EVERY finding id in the input, using that exact id. 2 to 3 sentences: what was found (with the key numbers), why it matters under the cited rules, and what to ask the operator. For info findings, one short sentence.`;

export const LETTER_SYSTEM = `${BASE}

Task: draft a formal letter from EAD to the operator, in English and in Modern Standard Arabic (formal UAE government register), as JSON { en: { subject, body }, ar: { subject, body } }.
- Both versions carry the same content: the same paragraphs, the same numbered points in the same order, and the same numbers, dates and deadlines.
- Start each body with the DRAFT line given in the facts. Keep the letterhead, reference, date, addressee, facility details and signature block as in the baseline draft.
- Use Western digits (0-9) in the Arabic text. Keep identifiers (for example AD-OG-0417, M-04, FT-5101), file names, units and chemical formulas in Latin characters.
- Body: plain text, a blank line between paragraphs, numbered points as lines starting "1. ", "2. " and so on. No markdown.
- Use the baseline draft as the structure and fact source. Improve clarity and flow, and make the Arabic a faithful, natural rendering of the full English content (the baseline Arabic is abbreviated).
- Do not add requirements, deadlines, amounts, rules or documents that are not in the facts or the baseline draft.`;

export const ASK_SYSTEM = `${BASE}

Task: answer the officer's question about this submission using only the context JSON.
- If the context does not contain the answer, say so plainly and suggest what the officer could check.
- Keep the answer under 180 words, in plain text.
- citations: the evidence you relied on. documentId must be one of the documents listed in the context; give page only when known; give quote only when copied verbatim from an excerpt, otherwise null.
- ruleIds: the rule ids you relied on, from the rules list only.`;

export const OBSERVATIONS_SYSTEM = `${BASE}

Task: read the document text and list up to 5 additional potential issues that the existing findings do NOT already cover, as JSON { observations: [...] }.
- Include an issue only if you can support it with at least one verbatim quote (copied exactly, at most 300 characters) from the document text, with its documentId and page.
- title: short. explanation: 2 to 3 sentences on why it may matter and what the officer could ask the operator.
- ruleIds only from the rules list. If nothing new is supported by the text, return an empty list.`;

const compactEvidence = (e: EvidenceRef) => ({
  documentId: e.documentId,
  fileName: e.fileName,
  locator: e.locator,
  ...(e.page ? { page: e.page } : {}),
  ...(e.quote ? { quote: clip(e.quote, 200) } : {}),
});

export function compactFinding(f: Finding, detailLimit = 6) {
  return {
    id: f.id,
    title: f.title,
    category: f.category,
    severity: f.severity,
    outcome: f.outcome,
    summary: f.summary,
    details: f.details.slice(0, detailLimit),
    evidence: f.evidence.slice(0, 4).map(compactEvidence),
    ruleIds: f.ruleIds,
    ...(f.impact ? { impact: f.impact } : {}),
    metrics: f.metrics,
  };
}

export const compactRules = (rules: RegulationRule[], withArabic = false) =>
  rules.map((r) => ({ id: r.id, citation: r.citation, title: r.title, ...(withArabic ? { citationAr: citationAr(r) } : {}) }));

export function compactReview(review: Review, detailLimit = 6) {
  return {
    status: review.status,
    riskScore: review.riskScore,
    riskBand: review.riskBand,
    headline: review.headline,
    metrics: review.metrics,
    recommendedAction: review.recommendedAction,
    ...(review.legalExposure ? { legalExposure: review.legalExposure } : {}),
    findings: review.findings.map((f) => compactFinding(f, detailLimit)),
    checks: review.checks.map((c) => ({ checkId: c.checkId, status: c.status, message: c.message })),
  };
}

/** Key numbers from the parsed workbook, small enough for a prompt. */
export function reportDigest(r: EmissionsReport) {
  return {
    facility: r.facility.name,
    eadId: r.facility.eadId,
    reportingYear: r.reportingYear,
    period: r.period,
    submittedOn: r.submittedOn,
    totals: r.totals,
    production: r.production,
    sourceStreams: r.sourceStreams.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.type,
      category: s.category,
      meterTag: s.meterTag,
      activityTier: s.activityTier,
      activity: s.activity,
      activityUnit: s.activityUnit,
      emissionFactor: s.emissionFactor,
      emissionFactorUnit: s.emissionFactorUnit,
      factorsBasis: s.factorsBasis,
      co2T: s.co2T,
    })),
    methane: r.methane.map((m) => ({ id: m.id, source: m.source, status: m.status, ch4T: m.ch4T, co2eT: m.co2eT, note: clip(m.note, 160) })),
    dataGapsDeclaredNone: r.dataGapsDeclaredNone,
    dataGaps: r.dataGaps.map((g) => ({ sourceStream: g.sourceStream, period: g.period, cause: g.cause, substitutionMethod: g.substitutionMethod })),
    verification: { body: r.verification.body, reference: r.verification.reference, outcome: r.verification.outcome, assurance: r.verification.assurance },
    ...(r.declaration ? { declaration: clip(r.declaration.text, 300) } : {}),
  };
}

export const jsonMessage = (label: string, data: unknown) => `${label} (JSON):\n${JSON.stringify(data)}`;

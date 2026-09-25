import { z } from "zod";
import type { LetterContent } from "@zerocarbon/shared";
import type { AiContext, LetterInput, LetterOutput } from "../types.ts";
import { maybeWriteCache, readCache } from "./cache.ts";
import { addDays, countNumbered, errorMessage, fmtDateAr, fmtDateEn, gstToday, guardNumbers, hasArabic, knownRuleIds, tidy, warn } from "./format.ts";
import { LETTER_SYSTEM, compactFinding, compactRules, jsonMessage } from "./prompts.ts";
import { type LetterDraft, letterReference, letterTemplate } from "./templates/letters.ts";
import { DRAFT_AR, DRAFT_EN, OFFICER_AR, OFFICER_EN, ORG_AR, ORG_EN, UNIT_AR, UNIT_EN } from "./templates/phrases.ts";

export { letterReference };

const Content = z.object({ subject: z.string(), body: z.string() });
export const LetterSchema = z.object({ en: Content, ar: Content });
const CachedLetter = z.object({ en: Content, ar: Content, model: z.string().nullish() });

const cacheKeyFor = (input: LetterInput) => `${input.review.inputHash}-${input.action}`;

export function letterFacts(input: LetterInput, draft: LetterDraft, today: Date) {
  const { identity: id, review } = input;
  const days = review.recommendedAction.responseDays ?? 30;
  const ruleIds = knownRuleIds(
    [
      ...review.findings.flatMap((f) => f.ruleIds),
      ...review.recommendedAction.ruleIds,
      ...(review.legalExposure?.ruleIds ?? []),
      "DL11-2024-ART6-1",
      "DL11-2024-ART15",
      "DL11-2024-ART16",
      "EAD-TGD-CORRECTIONS",
      "EAD-TGD-INSPECTION",
    ],
    input.rules,
  );
  return {
    action: input.action,
    reference: draft.reference,
    date: { en: fmtDateEn(today), ar: fmtDateAr(today) },
    responseDays: days,
    responseDeadline: { en: fmtDateEn(addDays(today, days)), ar: fmtDateAr(addDays(today, days)) },
    draftLine: { en: DRAFT_EN, ar: DRAFT_AR },
    from: { en: `${ORG_EN}, ${UNIT_EN}`, ar: `${ORG_AR}، ${UNIT_AR}` },
    signature: { name: input.officerName ?? null, title: { en: OFFICER_EN, ar: OFFICER_AR } },
    facility: id,
    review: {
      status: review.status,
      riskScore: review.riskScore,
      metrics: review.metrics,
      recommendedAction: review.recommendedAction,
      ...(review.legalExposure ? { legalExposure: review.legalExposure } : {}),
    },
    findings: review.findings.map((f) => compactFinding(f, 4)),
    rules: compactRules(
      input.rules.filter((r) => ruleIds.includes(r.id)),
      true,
    ),
    penalties:
      input.action === "request_clarification" || input.action === "refer_penalty"
        ? {
            article15: "a breach of Article 6(1) is punishable by a fine of AED 50,000 to AED 2,000,000, imposed by the courts; the operator may be exposed to it if the matters are not remedied",
            article16: "the penalty is doubled if the same act is repeated within two years of a previous final conviction",
          }
        : null,
  };
}

function withDraftLine(content: LetterContent, line: string): LetterContent {
  const body = tidy(content.body);
  return { subject: tidy(content.subject).split("\n")[0], body: body.startsWith(line) ? body : `${line}\n\n${body}` };
}

/** Validate a model letter; throws when it cannot be used. */
export function cleanLetter(raw: { en: LetterContent; ar: LetterContent }, input: LetterInput, draft: LetterDraft): { en: LetterContent; ar: LetterContent } {
  const en = withDraftLine(raw.en, DRAFT_EN);
  const ar = withDraftLine({ ...raw.ar, body: raw.ar.body.replace(/^(\s*\d+)\s*[-\u2013]\s+/gm, "$1. ") }, DRAFT_AR);
  const eadId = input.identity.eadId;
  if (!en.subject || !ar.subject) throw new Error("letter without subject");
  if (!hasArabic(raw.ar.subject + raw.ar.body.replace(DRAFT_AR, ""))) throw new Error("Arabic letter contains no Arabic script");
  if (!`${en.subject}\n${en.body}`.includes(eadId) || !`${ar.subject}\n${ar.body}`.includes(eadId)) throw new Error(`letter does not mention ${eadId}`);
  const [nEn, nAr] = [countNumbered(en.body), countNumbered(ar.body)];
  if (nEn !== nAr) throw new Error(`numbered points differ (en ${nEn}, ar ${nAr})`);
  if (countNumbered(draft.en.body) > 0 && nEn === 0) throw new Error("letter has no numbered points");
  return { en, ar };
}

export async function draftLetter(input: LetterInput, ctx: AiContext): Promise<LetterOutput> {
  const today = gstToday();
  const draft = letterTemplate(input, today);
  const key = cacheKeyFor(input);
  const template: LetterOutput = { en: draft.en, ar: draft.ar, reference: draft.reference, generatedBy: "template" };
  if (ctx.mode !== "live" || !ctx.client) {
    const cached = CachedLetter.safeParse(await readCache(ctx, "letter", key));
    if (!cached.success) return template;
    try {
      const { en, ar } = cleanLetter(cached.data, input, draft);
      return { en, ar, reference: draft.reference, generatedBy: "cache", ...(cached.data.model ? { model: cached.data.model } : {}) };
    } catch (err) {
      warn(`letter: cached letter rejected (${errorMessage(err)})`);
      return template;
    }
  }
  try {
    const facts = letterFacts(input, draft, today);
    const res = await ctx.client.chatJson({
      schema: LetterSchema,
      schemaName: "bilingual_letter",
      messages: [
        { role: "system", content: LETTER_SYSTEM },
        {
          role: "user",
          content: `${jsonMessage("Facts", facts)}\n\nBaseline draft, English:\nSubject: ${draft.en.subject}\n\n${draft.en.body}\n\nBaseline draft, Arabic:\nالموضوع: ${draft.ar.subject}\n\n${draft.ar.body}`,
        },
      ],
      temperature: 0.2,
      maxTokens: 8000,
    });
    const { en, ar } = cleanLetter(res.data, input, draft);
    guardNumbers("letter", [en.subject, en.body, ar.subject, ar.body], `${JSON.stringify(facts)}\n${draft.en.body}\n${draft.ar.body}`);
    await maybeWriteCache(ctx, "letter", key, { en, ar, reference: draft.reference, model: res.model });
    return { en, ar, reference: draft.reference, generatedBy: "llm", model: res.model };
  } catch (err) {
    warn(`letter: using template (${errorMessage(err)})`);
    return template;
  }
}

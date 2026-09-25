import { z } from "zod";
import type { AiContext, NarrativeInput, NarrativeOutput } from "../types.ts";
import { maybeWriteCache, readCache } from "./cache.ts";
import { errorMessage, guardNumbers, tidy, warn } from "./format.ts";
import { NARRATIVE_SYSTEM, compactFinding, compactRules, jsonMessage } from "./prompts.ts";
import { type NarrativeText, narrativeTemplate } from "./templates/narrative.ts";

export const NarrativeSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  explanations: z.array(z.object({ findingId: z.string(), text: z.string() })),
});

const CachedNarrative = z.object({
  headline: z.string().min(1),
  summary: z.string().min(1),
  explanations: z.record(z.string(), z.string()),
  model: z.string().nullish(),
});

export function narrativeFacts(input: NarrativeInput) {
  const applicable = input.checks.filter((c) => c.status !== "not_applicable");
  return {
    facility: input.identity,
    status: input.status,
    riskScore: input.riskScore,
    metrics: input.metrics,
    recommendedAction: input.recommendedAction,
    checks: {
      applicable: applicable.length,
      passed: applicable.filter((c) => c.status === "pass").length,
      notPassed: applicable.filter((c) => c.status !== "pass").map((c) => ({ checkId: c.checkId, status: c.status, message: c.message })),
    },
    findings: input.findings.map((f) => compactFinding(f)),
    rules: compactRules(input.rules),
  };
}

/** Keep only known finding ids, fill missing explanations from the template, tidy the text. */
export function cleanNarrative(
  raw: { headline: string; summary: string; explanations: Record<string, string> },
  input: NarrativeInput,
  template: NarrativeText,
): NarrativeText {
  const explanations: Record<string, string> = {};
  for (const f of input.findings) explanations[f.id] = tidy(raw.explanations[f.id] ?? "") || template.explanations[f.id];
  const dropped = Object.keys(raw.explanations).filter((id) => !(id in explanations));
  if (dropped.length) warn(`narrative: dropped explanations for unknown finding ids: ${dropped.join(", ")}`);
  return {
    headline: tidy(raw.headline).split("\n")[0].replace(/^headline:\s*/i, "").trim() || template.headline,
    summary: tidy(raw.summary).replace(/\s*\n+\s*/g, " ") || template.summary,
    explanations,
  };
}

export async function writeNarrative(input: NarrativeInput, ctx: AiContext): Promise<NarrativeOutput> {
  const template = narrativeTemplate(input);
  if (ctx.mode !== "live" || !ctx.client) {
    const cached = CachedNarrative.safeParse(await readCache(ctx, "narrative", input.inputHash));
    if (!cached.success) return { ...template, source: "template" };
    const { model } = cached.data;
    return { ...cleanNarrative(cached.data, input, template), source: "cache", ...(model ? { model } : {}) };
  }
  try {
    const facts = narrativeFacts(input);
    const res = await ctx.client.chatJson({
      schema: NarrativeSchema,
      schemaName: "review_narrative",
      messages: [
        { role: "system", content: NARRATIVE_SYSTEM },
        { role: "user", content: jsonMessage("Review facts", facts) },
      ],
      temperature: 0.2,
      maxTokens: 4000,
    });
    const raw = { ...res.data, explanations: Object.fromEntries(res.data.explanations.map((e) => [e.findingId.trim(), e.text])) };
    if (!raw.headline.trim() || !raw.summary.trim()) throw new Error("empty headline or summary");
    const out = cleanNarrative(raw, input, template);
    guardNumbers("narrative", [raw.headline, raw.summary, ...Object.values(raw.explanations)], JSON.stringify(facts));
    await maybeWriteCache(ctx, "narrative", input.inputHash, { ...out, model: res.model });
    return { ...out, source: "llm", model: res.model };
  } catch (err) {
    warn(`narrative: using template (${errorMessage(err)})`);
    return { ...template, source: "template" };
  }
}

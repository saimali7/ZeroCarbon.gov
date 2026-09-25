import { createHash } from "node:crypto";
import { z } from "zod";
import type { AiObservation, EvidenceRef, Finding } from "@zerocarbon/shared";
import type { AiContext, ObservationsInput } from "../types.ts";
import { maybeWriteCache, readCache } from "./cache.ts";
import { clip, errorMessage, findQuote, guardNumbers, knownRuleIds, tidy, warn } from "./format.ts";
import { OBSERVATIONS_SYSTEM, compactRules, jsonMessage, reportDigest } from "./prompts.ts";

/** ObservationsInput plus the review input hash used as the cache key (derived from the package when absent). */
export type ObservationsRequest = ObservationsInput & { inputHash?: string };

export const ObservationsSchema = z.object({
  observations: z.array(
    z.object({
      title: z.string(),
      explanation: z.string(),
      evidence: z.array(z.object({ documentId: z.string(), page: z.number().nullable(), quote: z.string() })),
      ruleIds: z.array(z.string()),
    }),
  ),
});

const EvidenceSchema = z.object({
  documentId: z.string(),
  fileName: z.string(),
  locator: z.string(),
  page: z.number().optional(),
  quote: z.string().optional(),
});
const CachedObservations = z.array(
  z.object({ id: z.string(), title: z.string(), explanation: z.string(), evidence: z.array(EvidenceSchema), ruleIds: z.array(z.string()), quotesVerified: z.boolean() }),
);

export function observationsKey(input: ObservationsRequest): string {
  if (input.inputHash) return input.inputHash;
  const basis = JSON.stringify([
    input.pkg.submissionId,
    input.pkg.documents.map((d) => d.sha256).sort(),
    input.findings.map((f) => `${f.id}:${f.checkId}`),
  ]);
  return createHash("sha256").update(basis).digest("hex").slice(0, 24);
}

const words = (s: string) => new Set(s.toLowerCase().match(/[a-z0-9-]{4,}/g) ?? []);
function overlapsFinding(title: string, findings: Finding[]): boolean {
  const a = words(title);
  return findings.some((f) => {
    const b = words(f.title);
    const shared = [...a].filter((w) => b.has(w)).length;
    return a.size > 0 && shared / new Set([...a, ...b]).size >= 0.5;
  });
}

/** Document text for the prompt, capped per page and in total. */
export function documentDigest(input: ObservationsInput, maxChars = 60_000, perPage = 3500): string {
  const names = new Map(input.pkg.documents.map((d) => [d.id, d.fileName]));
  const parts: string[] = [];
  let used = 0;
  for (const [documentId, pages] of Object.entries(input.pkg.pdfText)) {
    for (const p of pages) {
      const chunk = `=== documentId: ${documentId} | file: ${names.get(documentId) ?? documentId} | page ${p.page} ===\n${p.text.slice(0, perPage)}`;
      if (used + chunk.length > maxChars) return parts.join("\n\n");
      parts.push(chunk);
      used += chunk.length;
    }
  }
  return parts.join("\n\n");
}

/** Verify quotes against the PDF text, drop observations without a verified quote, filter rule ids, cap at 5. */
export function cleanObservations(raw: z.infer<typeof ObservationsSchema>["observations"], input: ObservationsInput): AiObservation[] {
  const docs = new Map(input.pkg.documents.map((d) => [d.id, d]));
  const out: AiObservation[] = [];
  for (const o of raw) {
    if (out.length >= 5) break;
    const title = tidy(o.title);
    const explanation = tidy(o.explanation);
    if (!title || !explanation || overlapsFinding(title, input.findings)) continue;
    const evidence: EvidenceRef[] = [];
    for (const e of o.evidence) {
      const doc = docs.get(e.documentId.trim());
      const hit = doc ? findQuote(input.pkg.pdfText[doc.id], e.quote, e.page ?? undefined) : undefined;
      if (doc && hit) evidence.push({ documentId: doc.id, fileName: doc.fileName, locator: `Page ${hit.page}`, page: hit.page, quote: clip(e.quote.trim(), 300) });
    }
    if (!evidence.length) {
      warn(`observations: dropped "${clip(title, 60)}" (no verified quote)`);
      continue;
    }
    out.push({
      id: `AI-${String(out.length + 1).padStart(2, "0")}`,
      title,
      explanation,
      evidence,
      ruleIds: knownRuleIds(o.ruleIds, input.rules),
      quotesVerified: evidence.length === o.evidence.length,
    });
  }
  return out;
}

async function cached(input: ObservationsRequest, ctx: AiContext): Promise<AiObservation[]> {
  const parsed = CachedObservations.safeParse(await readCache(ctx, "observations", observationsKey(input)));
  return parsed.success ? parsed.data.map((o) => ({ ...o, ruleIds: knownRuleIds(o.ruleIds, input.rules) })) : [];
}

export async function findObservations(input: ObservationsRequest, ctx: AiContext): Promise<AiObservation[]> {
  if (ctx.mode !== "live" || !ctx.client) return cached(input, ctx);
  const text = documentDigest(input);
  if (!text) return [];
  try {
    const facts = {
      facility: input.identity,
      existingFindings: input.findings.map((f) => ({ id: f.id, title: f.title, category: f.category, summary: f.summary })),
      documents: input.pkg.documents.map((d) => ({ id: d.id, fileName: d.fileName, kind: d.kind, pageCount: d.pageCount })),
      report: input.pkg.report ? reportDigest(input.pkg.report) : null,
      rules: compactRules(input.rules),
    };
    const res = await ctx.client.chatJson({
      schema: ObservationsSchema,
      schemaName: "ai_observations",
      messages: [
        { role: "system", content: OBSERVATIONS_SYSTEM },
        { role: "user", content: `${jsonMessage("Facts", facts)}\n\nDocument text (quote only from here):\n${text}` },
      ],
      temperature: 0.2,
      maxTokens: 3000,
    });
    const out = cleanObservations(res.data.observations, input);
    guardNumbers(
      "observations",
      out.map((o) => `${o.title} ${o.explanation}`),
      `${JSON.stringify(facts)}\n${text}`,
    );
    await maybeWriteCache(ctx, "observations", observationsKey(input), out);
    return out;
  } catch (err) {
    warn(`observations: none (${errorMessage(err)})`);
    return cached(input, ctx);
  }
}

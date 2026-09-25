import type { DocumentFacts } from "@zerocarbon/shared";
import type { OpenRouterClient } from "../ai/openrouter.ts";
import type { AiContext, SubmissionPackage } from "../types.ts";
import { EXTRACTABLE_KINDS, type KindFacts, heuristicFacts } from "./heuristics.ts";
import { llmFacts } from "./llm.ts";
import { type DocText, buildDoc } from "./text.ts";

const SINGLE = ["gasAnalysis", "verification", "monitoringPlan", "coverLetter", "ldar"] as const;

interface DocResult {
  doc: DocText;
  facts: KindFacts;
  warnings: string[];
  model?: string;
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Facts from the submission's PDF documents. Demo mode: regex heuristics only. Live mode: one LLM call per
 * document (in parallel), validated against the page text, falling back to the heuristics. Never throws.
 */
export async function extractDocumentFacts(pkg: SubmissionPackage, ctx: AiContext): Promise<DocumentFacts> {
  const warnings: string[] = [];
  const docs: DocText[] = [];
  for (const document of pkg.documents ?? []) {
    if (!EXTRACTABLE_KINDS.has(document.kind)) continue;
    const pages = (pkg.pdfText?.[document.id] ?? []).filter((p) => typeof p?.text === "string");
    if (!pages.some((p) => p.text.trim())) {
      warnings.push(`${document.fileName}: no text could be read from this document, so no facts were extracted`);
      continue;
    }
    docs.push(buildDoc(document, pages));
  }

  const client = ctx.mode === "live" ? ctx.client : undefined;
  const results = await Promise.all(docs.map((doc) => extractOne(doc, client)));

  const facts: DocumentFacts = { calibration: [], extractedBy: "heuristic", warnings };
  for (const r of results) {
    warnings.push(...r.warnings);
    if (r.model) {
      facts.extractedBy = "llm";
      facts.model ??= r.model;
    }
    facts.calibration.push(...(r.facts.calibration ?? []));
    for (const key of SINGLE) {
      if (!r.facts[key]) continue;
      if (facts[key]) warnings.push(`${r.doc.document.fileName}: more than one ${r.doc.document.kind.replace(/_/g, " ")} document; this one was ignored`);
      else Object.assign(facts, { [key]: r.facts[key] });
    }
  }
  return facts;
}

async function extractOne(doc: DocText, client?: OpenRouterClient): Promise<DocResult> {
  const warnings: string[] = [];
  let facts: KindFacts = {};
  try {
    facts = heuristicFacts(doc, warnings);
  } catch (err) {
    warnings.push(`${doc.document.fileName}: heuristic extraction failed (${errorText(err)})`);
  }
  if (!client) return { doc, facts, warnings };
  try {
    const llmWarnings: string[] = [];
    const result = await llmFacts(doc, facts, client, llmWarnings);
    return { doc, facts: result.facts, warnings: llmWarnings, model: result.used ? result.model : undefined };
  } catch (err) {
    warnings.push(`${doc.document.fileName}: LLM extraction failed (${errorText(err)}); used heuristic extraction`);
    return { doc, facts, warnings };
  }
}

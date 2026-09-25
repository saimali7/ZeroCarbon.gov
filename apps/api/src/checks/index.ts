/**
 * Deterministic checks engine. Pure and synchronous: the same input always gives the same checks and findings.
 * Checks find and quantify issues with evidence; they never decide. Every CheckRun is returned, including
 * passes and not_applicable, and findings are numbered F-01, F-02... by severity, then category.
 */
import type { FindingCategory, FindingOutcome } from "@zerocarbon/shared";
import type { ChecksResult, ReviewInput } from "../types.ts";
import { benchmarkChecks } from "./benchmark.ts";
import { calculationChecks } from "./calculation.ts";
import { completenessChecks } from "./completeness.ts";
import { CATEGORY_ORDER, SEVERITY_ORDER, createContext, type CheckContext, type CheckOutput, type DraftFinding } from "./context.ts";
import { dataGapChecks } from "./data-gaps.ts";
import { emissionFactorChecks } from "./emission-factor.ts";
import { evidenceChecks } from "./evidence.ts";
import { methaneChecks } from "./methane.ts";
import { satelliteChecks } from "./satellite.ts";
import { verificationChecks } from "./verification.ts";

export { MATERIALITY_PCT, REFERENCE_DOCUMENT_IDS } from "./context.ts";

const OUTCOME_ORDER: readonly FindingOutcome[] = ["breach", "clarification", "signal"];

const GROUPS: [FindingCategory, (ctx: CheckContext) => CheckOutput[]][] = [
  ["completeness", completenessChecks],
  ["calculation", calculationChecks],
  ["evidence", evidenceChecks],
  ["data_gap", dataGapChecks],
  ["emission_factor", emissionFactorChecks],
  ["methane", methaneChecks],
  ["benchmark", benchmarkChecks],
  ["satellite", satelliteChecks],
];

/** A failing check group is reported as an "error" CheckRun instead of failing the whole review. */
function guarded(category: FindingCategory, run: () => CheckOutput[]): CheckOutput[] {
  try {
    return run();
  } catch (error) {
    const message = `Check could not run: ${error instanceof Error ? error.message : String(error)}`;
    return [{ checkId: `${category}.error`, title: `${category} checks`, category, status: "error", message, findings: [] }];
  }
}

export function runChecks(input: ReviewInput): ChecksResult {
  const ctx = createContext(input);
  const outputs = GROUPS.flatMap(([category, run]) => guarded(category, () => run(ctx)));
  // Verification compares the operator's declarations with the breaches found above.
  outputs.push(...guarded("verification", () => verificationChecks(ctx, outputs.flatMap((o) => o.findings))));
  return finalize(outputs);
}

function finalize(outputs: CheckOutput[]): ChecksResult {
  const rank = (f: DraftFinding) => [SEVERITY_ORDER.indexOf(f.severity), CATEGORY_ORDER.indexOf(f.category), OUTCOME_ORDER.indexOf(f.outcome)];
  const drafts = [...new Set(outputs.flatMap((o) => o.findings))].map((finding, index) => ({ finding, index, rank: rank(finding) }));
  drafts.sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.rank[2] - b.rank[2] || a.index - b.index);
  const ids = new Map(drafts.map(({ finding }, i) => [finding, `F-${String(i + 1).padStart(2, "0")}`]));
  return {
    checks: outputs.map(({ findings, ...run }) => ({ ...run, findingIds: [...new Set(findings.map((f) => ids.get(f)!))] })),
    findings: drafts.map(({ finding }) => ({ id: ids.get(finding)!, ...finding })),
  };
}

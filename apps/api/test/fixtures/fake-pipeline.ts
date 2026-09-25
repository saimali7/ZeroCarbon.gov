import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { Finding, Review } from "@zerocarbon/shared";
import type { ReviewPipeline } from "../../src/types.ts";
import { NORTH, SOUTH } from "./fake-catalog.ts";

const finding = (id: string, title: string, tco2e: number): Finding => ({
  id,
  checkId: `check-${id}`,
  title,
  category: "evidence",
  severity: "critical",
  outcome: "breach",
  summary: `${title} (${tco2e} t CO2e)`,
  details: [],
  evidence: [{ documentId: "flare-log", fileName: "Flare-Log_Daily_2025.csv", locator: "Rows 2025-06-01..2025-12-31" }],
  ruleIds: ["EAD-TGD-DATA-GAPS"],
  impact: { tco2e, basis: "balance", countsTowardTotal: true },
  metrics: { tco2e },
});

type Canned = Pick<Review, "status" | "riskScore" | "riskBand" | "findings" | "durationMs"> & { underReported: number; reported: number };

const CANNED: Record<string, Canned> = {
  [SOUTH]: {
    status: "non_compliant",
    riskScore: 88,
    riskBand: "critical",
    findings: [finding("F-01", "Undeclared flare data gap", 90_000), finding("F-02", "Methane sources excluded", 30_000)],
    durationMs: 1500,
    underReported: 120_000,
    reported: 1_000_000,
  },
  [NORTH]: { status: "compliant", riskScore: 8, riskBand: "low", findings: [], durationMs: 900, underReported: 0, reported: 500_000 },
};
const DEFAULT: Canned = { status: "needs_clarification", riskScore: 45, riskBand: "medium", findings: [], durationMs: 600, underReported: 5_000, reported: 250_000 };

export function makeReview(submissionId: string, overrides: Partial<Review> = {}): Review {
  const c = CANNED[submissionId] ?? DEFAULT;
  return {
    id: randomUUID(),
    submissionId,
    createdAt: new Date().toISOString(),
    durationMs: c.durationMs,
    aiMode: "demo",
    narrativeSource: "template",
    status: c.status,
    riskScore: c.riskScore,
    riskBand: c.riskBand,
    headline: `${c.status} (${c.riskScore})`,
    summary: "Canned review",
    findings: c.findings,
    checks: [],
    metrics: {
      reportedTotalTco2e: c.reported,
      co2T: c.reported,
      ch4T: 0,
      estimatedUnderReportingTco2e: c.underReported,
      estimatedUnderReportingPct: (c.underReported / c.reported) * 100,
      correctedTotalTco2e: c.reported + c.underReported,
    },
    recommendedAction: { primary: c.status === "compliant" ? "approve" : "escalate_inspection", alsoConsider: [], rationale: "Canned", ruleIds: [] },
    aiObservations: [],
    facts: { calibration: [], extractedBy: "heuristic", warnings: [] },
    stages: [],
    inputHash: "hash",
    ...overrides,
  };
}

export interface FakePipeline extends ReviewPipeline {
  calls: string[];
  failIds: Set<string>;
  readonly maxConcurrent: number;
}

export function createFakePipeline(delayMs = 30): FakePipeline {
  const calls: string[] = [];
  const failIds = new Set<string>();
  let active = 0;
  let maxConcurrent = 0;
  return {
    calls,
    failIds,
    get maxConcurrent() {
      return maxConcurrent;
    },
    async run(submissionId) {
      calls.push(submissionId);
      active += 1;
      maxConcurrent = Math.max(maxConcurrent, active);
      try {
        await delay(delayMs);
        if (failIds.has(submissionId)) throw new Error("Workbook could not be parsed");
        return makeReview(submissionId);
      } finally {
        active -= 1;
      }
    },
  };
}

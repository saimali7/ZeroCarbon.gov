import assert from "node:assert/strict";
import { test } from "node:test";
import type { DocumentFacts, EmissionsReport, ReferenceData } from "@zerocarbon/shared";
import { createPipeline } from "../src/review/pipeline.ts";
import type { ChecksResult, ScoreResult, SubmissionCatalog, SubmissionPackage, SubmissionRecord } from "../src/types.ts";

const record = (id: string, year = 2025): SubmissionRecord => ({
  id,
  source: "demo",
  rootDir: `/tmp/${id}`,
  receivedAt: "2026-03-30",
  facilityName: `Facility ${id}`,
  facilityShortName: id,
  operator: "Op",
  eadId: `AD-${id}`,
  reportingYear: year,
  documentCount: 1,
});

const report = { facility: { name: "F", eadId: "AD-a" }, operator: { name: "Op", nameAr: "مشغل" }, reportingYear: 2025 } as EmissionsReport;
const reference: ReferenceData = { peers: [], priorYear: [], detections: [], facilities: [], sources: {} };
const facts: DocumentFacts = { calibration: [], extractedBy: "heuristic", warnings: [] };

function fakeCatalog(records: SubmissionRecord[], withReport = true): SubmissionCatalog {
  return {
    list: async () => records,
    get: async (id) => records.find((r) => r.id === id),
    loadPackage: async (id): Promise<SubmissionPackage> => ({
      submissionId: id,
      source: "demo",
      rootDir: "/tmp",
      documents: [],
      pdfText: {},
      report: withReport ? { ...report, facility: { ...report.facility, eadId: `AD-${id}` } } : undefined,
      evidence: {},
      warnings: [],
      loadedInMs: 1,
    }),
    readDocument: async () => undefined,
    createFromUpload: async () => records[0],
    getReference: async () => reference,
  };
}

const checks: ChecksResult = {
  checks: [{ checkId: "c1", title: "C1", category: "calculation", status: "fail", message: "m", findingIds: ["F-01"] }],
  findings: [
    { id: "F-01", checkId: "c1", title: "T", category: "calculation", severity: "high", outcome: "breach", summary: "s", details: [], evidence: [], ruleIds: [], metrics: {} },
  ],
};
const score: ScoreResult = {
  status: "non_compliant",
  riskScore: 80,
  riskBand: "high",
  metrics: { reportedTotalTco2e: 1, co2T: 1, ch4T: 0, estimatedUnderReportingTco2e: 0, estimatedUnderReportingPct: 0, correctedTotalTco2e: 1 },
  recommendedAction: { primary: "request_clarification", alsoConsider: [], rationale: "r", ruleIds: [] },
};

test("pipeline runs every stage, passes peers and applies AI explanations", async () => {
  let peerCount = -1;
  const pipeline = createPipeline({
    catalog: fakeCatalog([record("a"), record("b"), record("c", 2024)]),
    ai: { mode: "demo", cacheDir: "/tmp" },
    rules: () => [],
    extractFacts: async () => facts,
    runChecks: (input) => {
      peerCount = input.peerSubmissions.length;
      return checks;
    },
    scoreReview: () => score,
    writeNarrative: async (input) => ({
      headline: "H",
      summary: "S",
      explanations: { "F-01": `explained ${input.identity.operatorAr}` },
      source: "template",
    }),
    now: () => new Date("2026-04-01T08:00:00Z"),
  });

  const review = await pipeline.run("a");
  assert.equal(peerCount, 1, "only same-year peers");
  assert.equal(review.status, "non_compliant");
  assert.equal(review.findings[0].explanation, "explained مشغل");
  assert.deepEqual(review.stages.map((s) => s.name).sort(), ["checks", "extract", "ingest", "narrative", "score"]);
  assert.equal(review.createdAt, "2026-04-01T08:00:00.000Z");
  assert.match(review.inputHash, /^[0-9a-f]{24}$/);

  const again = await pipeline.run("a");
  assert.equal(again.inputHash, review.inputHash, "input hash is deterministic");
});

test("pipeline rejects unknown submissions and packages without a workbook", async () => {
  const base = {
    ai: { mode: "demo" as const, cacheDir: "/tmp" },
    rules: () => [],
    extractFacts: async () => facts,
    runChecks: () => checks,
    scoreReview: () => score,
    writeNarrative: async () => ({ headline: "", summary: "", explanations: {}, source: "template" as const }),
  };
  await assert.rejects(createPipeline({ ...base, catalog: fakeCatalog([record("a")]) }).run("zzz"), { status: 404 });
  await assert.rejects(createPipeline({ ...base, catalog: fakeCatalog([record("a")], false) }).run("a"), { status: 422 });
});

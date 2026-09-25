import assert from "node:assert/strict";
import { test } from "node:test";
import type { Review } from "@zerocarbon/shared";
import { createContainer } from "../src/container.ts";
import { isKnownRule } from "../src/regulations/index.ts";

// Full pipeline on the real demo packages (demo mode: offline, no API key).
const container = createContainer({ aiMode: "demo" });

async function reviewFor(eadId: string): Promise<Review> {
  const record = (await container.catalog.list()).find((r) => r.eadId === eadId);
  assert.ok(record, `demo submission ${eadId} exists`);
  return container.pipeline.run(record.id);
}

test("Southern Dunes CPF-2 is non-compliant and matches the answer key", async () => {
  const review = await reviewFor("AD-OG-0417");
  assert.equal(review.status, "non_compliant");
  assert.ok(review.riskScore >= 85 && review.riskScore <= 90, `risk ${review.riskScore}`);
  assert.ok(Math.abs(review.metrics.estimatedUnderReportingTco2e - 54_179) <= 50, `under-reporting ${review.metrics.estimatedUnderReportingTco2e}`);
  assert.equal(review.metrics.estimatedUnderReportingPct, 19.7);
  assert.ok(Math.abs(review.metrics.correctedTotalTco2e - 329_075) <= 50);
  assert.equal(review.recommendedAction.primary, "request_clarification");
  assert.ok(review.recommendedAction.alsoConsider.includes("escalate_inspection"));
  assert.ok(review.legalExposure);

  const byCheck = (id: string) => review.findings.find((f) => f.checkId.startsWith(id));
  assert.equal(byCheck("evidence.gas_balance")?.outcome, "breach");
  assert.ok(Math.abs((byCheck("evidence.gas_balance")?.impact?.tco2e ?? 0) - 39_447) <= 10);
  assert.equal(byCheck("methane.completeness")?.outcome, "breach");
  assert.ok(Math.abs((byCheck("methane.completeness")?.impact?.tco2e ?? 0) - 11_648) <= 10);
  assert.equal(byCheck("data_gaps")?.outcome, "breach");
  assert.equal(byCheck("verification")?.outcome, "breach");
  assert.equal(byCheck("emission_factor.fuel_gas")?.impact?.tco2e, 3_084);
  assert.ok(byCheck("satellite"));
  assert.ok(byCheck("benchmark") && byCheck("trend"));

  for (const f of review.findings) {
    assert.ok(f.evidence.length > 0, `${f.id} has evidence`);
    for (const id of f.ruleIds) assert.ok(isKnownRule(id), `${f.id} cites known rule ${id}`);
    if (f.severity !== "info") assert.ok(f.explanation, `${f.id} has an explanation`);
  }
  assert.ok(review.summary.length > 80);
  assert.equal(review.stages.length, 5);
});

test("Eastern Dunes CPF-1 is compliant with no breaches", async () => {
  const review = await reviewFor("AD-OG-0412");
  assert.equal(review.status, "compliant");
  assert.ok(review.riskScore <= 15);
  assert.equal(review.recommendedAction.primary, "approve");
  assert.equal(review.findings.filter((f) => f.outcome !== "signal").length, 0);
  assert.equal(review.metrics.estimatedUnderReportingTco2e, 0);
  assert.ok(review.checks.filter((c) => c.status === "pass").length >= 15);
});

test("bilingual letters draft for every decision on the demo review", async () => {
  const record = (await container.catalog.list()).find((r) => r.eadId === "AD-OG-0417")!;
  const review = await container.pipeline.run(record.id);
  const pkg = await container.catalog.loadPackage(record.id);
  const { listRules } = await import("../src/regulations/index.ts");
  const { buildIdentity } = await import("../src/review/pipeline.ts");
  for (const action of ["request_clarification", "escalate_inspection", "refer_penalty", "approve"] as const) {
    const letter = await container.aiServices.draftLetter({ identity: buildIdentity(record, pkg), review, action, rules: listRules() });
    assert.match(letter.en.body, /AD-OG-0417/);
    assert.match(letter.ar.body, /[\u0600-\u06FF]/);
    assert.match(letter.ar.body, /AD-OG-0417/);
  }
});

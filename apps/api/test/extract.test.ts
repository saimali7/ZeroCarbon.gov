import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import type { DocumentFacts, DocumentKind, EvidenceRef, SubmissionDocument } from "@zerocarbon/shared";
import type { JsonChatOptions, OpenRouterClient } from "../src/ai/openrouter.ts";
import { config } from "../src/config.ts";
import { extractDocumentFacts } from "../src/extract/index.ts";
import { expandIds, locateQuote, parseDate, parseNum } from "../src/extract/text.ts";
import { extractPdfPages } from "../src/ingest/pdf.ts";
import type { AiContext, PageText, SubmissionPackage } from "../src/types.ts";

const SUBMISSIONS = path.join(config.dataDir, "submissions");
const SOUTH = "DEC_Southern-Dunes-CPF2_RY2025";
const EAST = "DEC_Eastern-Dunes-CPF1_RY2025";
const DEMO: AiContext = { mode: "demo", cacheDir: "" };
const KINDS: [RegExp, DocumentKind][] = [
  [/Cover-Letter/, "cover_letter"],
  [/Monitoring-Plan/, "monitoring_plan"],
  [/Verification-Statement/, "verification_statement"],
  [/Meter-Calibration-Certificates/, "calibration_certificates"],
  [/Gas-Analysis-Certificate/, "gas_analysis_certificate"],
  [/LDAR-Survey-Summary/, "ldar_survey"],
];

async function loadPackage(folder: string): Promise<SubmissionPackage> {
  const rootDir = path.join(SUBMISSIONS, folder);
  const files = [...(await readdir(rootDir)), ...(await readdir(path.join(rootDir, "evidence"))).map((f) => `evidence/${f}`)];
  const documents: SubmissionDocument[] = [];
  const pdfText: Record<string, PageText[]> = {};
  for (const rel of files.filter((f) => f.endsWith(".pdf"))) {
    const data = await readFile(path.join(rootDir, rel));
    const id = path.basename(rel, ".pdf").toLowerCase();
    pdfText[id] = await extractPdfPages(data);
    documents.push({
      id,
      fileName: path.basename(rel),
      relativePath: rel,
      kind: KINDS.find(([re]) => re.test(rel))?.[1] ?? "other",
      mediaType: "application/pdf",
      sizeBytes: data.length,
      sha256: "",
      pageCount: pdfText[id].length,
    });
  }
  return { submissionId: folder, source: "demo", rootDir, documents, pdfText, evidence: {}, warnings: [], loadedInMs: 0 };
}

const cache = new Map<string, Promise<SubmissionPackage>>();
function load(folder: string): Promise<SubmissionPackage> {
  if (!cache.has(folder)) cache.set(folder, loadPackage(folder));
  return cache.get(folder)!;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function allEvidence(f: DocumentFacts): EvidenceRef[] {
  return [
    ...f.calibration.map((c) => c.evidence),
    ...(f.gasAnalysis?.evidence ?? []),
    ...(f.verification?.evidence ?? []),
    ...(f.verification?.findings.map((x) => x.evidence) ?? []),
    ...(f.monitoringPlan?.statements.map((s) => s.evidence) ?? []),
    ...(f.coverLetter?.declarations.map((d) => d.evidence) ?? []),
    ...(f.ldar?.evidence ?? []),
  ];
}

function assertEvidence(pkg: SubmissionPackage, facts: DocumentFacts) {
  const refs = allEvidence(facts);
  assert.ok(refs.length >= 15, `expected plenty of evidence, got ${refs.length}`);
  for (const r of refs) {
    const pages = pkg.pdfText[r.documentId];
    assert.ok(pages, `unknown document ${r.documentId}`);
    assert.equal(r.fileName, pkg.documents.find((d) => d.id === r.documentId)?.fileName);
    assert.ok(r.page !== undefined && r.page >= 1 && r.page <= pages.length, `page ${r.page} out of range in ${r.fileName}`);
    assert.equal(r.locator, `Page ${r.page}`);
    assert.ok(r.quote && r.quote.length > 0 && r.quote.length <= 200, `bad quote length: ${r.quote}`);
    assert.ok(norm(pages[r.page - 1].text).includes(norm(r.quote)), `quote not on ${r.fileName} page ${r.page}: ${r.quote}`);
  }
  assert.ok(facts.gasAnalysis?.evidence.length && facts.verification?.evidence.length);
}

test("text helpers: dates, numbers, id ranges, quote location", () => {
  assert.equal(parseDate("18 January 2025"), "2025-01-18");
  assert.equal(parseDate("12-Feb-2025"), "2025-02-12");
  assert.equal(parseDate("March 30, 2026"), "2026-03-30");
  assert.equal(parseDate("18/01/2025"), "2025-01-18");
  assert.equal(parseDate("2026-03-24"), "2026-03-24");
  assert.equal(parseDate("2025-02-30"), undefined);
  assert.equal(parseDate("next February"), undefined);
  assert.equal(parseNum("274,896"), 274896);
  assert.equal(parseNum("5%"), 5);
  assert.deepEqual(expandIds("Methane sources M-04 to M-08 and SS-02"), ["M-04", "M-05", "M-06", "M-07", "M-08", "SS-02"]);
  assert.equal(locateQuote("Date of calibration\n18 January  2025", "date of CALIBRATION 18 january 2025"), "Date of calibration 18 January 2025");
  assert.equal(locateQuote("Date of calibration 18 January 2025", "Date of calibration 19 January 2025"), undefined);
});

test("South (DEC-SDF-CPF2): heuristic facts match the documents", async () => {
  const pkg = await load(SOUTH);
  const f = await extractDocumentFacts(pkg, DEMO);
  assert.equal(f.extractedBy, "heuristic");
  assert.equal(f.model, undefined);
  assert.deepEqual(f.warnings, []);

  const cal = Object.fromEntries(f.calibration.map((c) => [c.tag, c]));
  assert.deepEqual(Object.keys(cal), ["FT-3001", "FT-5101", "FT-5102"]);
  assert.deepEqual(
    [cal["FT-3001"].calibratedOn, cal["FT-3001"].nextDue, cal["FT-3001"].result, cal["FT-3001"].service, cal["FT-3001"].certificateNo],
    ["2025-01-18", "2026-01-31", "PASS", "Fuel gas header", "GCS-CAL-25-0117"],
  );
  assert.deepEqual([cal["FT-5101"].calibratedOn, cal["FT-5101"].nextDue, cal["FT-5101"].evidence.page], ["2024-05-28", "2025-05-31", 2]);
  assert.match(cal["FT-5101"].evidence.quote ?? "", /Next calibration due 31 May 2025/);
  assert.deepEqual([cal["FT-5102"].calibratedOn, cal["FT-5102"].nextDue], ["2025-02-10", "2026-02-28"]);

  const gas = f.gasAnalysis!;
  assert.equal(gas.reportNo, "SAL-25-GC-0417");
  assert.equal(gas.issuedOn, "2025-12-03");
  assert.equal(gas.samples.length, 8);
  assert.equal(gas.samples.filter((s) => s.stream === "fuel").length, 4);
  assert.equal(gas.samples.filter((s) => s.stream === "flare").length, 4);
  assert.deepEqual([...new Set(gas.samples.map((s) => s.sampledOn))], ["2025-02-12", "2025-05-14", "2025-08-13", "2025-11-12"]);
  assert.equal(gas.fuelEfMeanTco2PerTj, 56.96);
  assert.equal(gas.fuelNcvMeanMjPerSm3, 36.35);
  assert.equal(gas.flareCo2FactorTPer1000Sm3, 2.468);
  assert.equal(gas.flareCh4FactorTPer1000Sm3, 0.5183);

  const v = f.verification!;
  assert.deepEqual([v.reference, v.date, v.opinion, v.materialityPct, v.assuranceLevel], ["KVS-25-117", "2026-03-24", "qualified", 5, "Reasonable assurance"]);
  assert.equal(v.body, "Kestrel Verification Services LLC");
  assert.deepEqual(v.scopeExclusions, ["M-04", "M-05", "M-06", "M-07", "M-08"]);
  const findings = Object.fromEntries(v.findings.map((x) => [x.id, x]));
  assert.deepEqual(Object.keys(findings), ["F-01", "F-02", "F-03", "F-04"]);
  assert.match(findings["F-01"].description, /emission factor/);
  assert.equal(findings["F-01"].status, "unresolved");
  assert.equal(findings["F-01"].impactTco2e, 3084);
  assert.equal(findings["F-02"].status, "resolved");
  assert.equal(findings["F-03"].status, "unresolved");
  assert.match(findings["F-03"].description, /FT-5101/);
  assert.equal(findings["F-04"].status, "open");

  const mp = f.monitoringPlan!;
  assert.deepEqual([mp.documentNo, mp.revision, mp.date], ["DEC-SDF-CPF2-HSE-MP-001", "3.0", "2025-03-27"]);
  const topic = (t: string) => mp.statements.filter((s) => s.topic === t);
  assert.equal(topic("methane_method")[0].section, "6.3");
  assert.match(topic("methane_method")[0].text, /under development/);
  assert.match(topic("methane_method")[0].evidence.quote ?? "", /under development/);
  assert.ok(topic("tank_venting").some((s) => /pressure\/vacuum vents/.test(s.text)));
  assert.ok(topic("tank_venting").some((s) => /P\/V vents to atmosphere/.test(s.text) && s.section === "3"));
  assert.equal(topic("data_gap_procedure")[0].section, "8.3");
  assert.match(topic("data_gap_procedure")[0].text, /average of the 30 days.*notified to the Agency/);
  assert.equal(topic("reconciliation_control")[0].section, "8.2");
  assert.match(topic("reconciliation_control")[0].text, /greater than 10%/);
  assert.equal(topic("emission_factor_method")[0].section, "5.2");
  assert.match(topic("emission_factor_method")[0].text, /Site-specific/);
  assert.match(topic("meter_calibration")[0].text, /12 months/);

  const cl = f.coverLetter!;
  assert.deepEqual([cl.reference, cl.date, cl.reportedTotalTco2e], ["DEC/SDF/HSE/2026/0330", "2026-03-30", 274896]);
  assert.deepEqual(
    cl.declarations.map((d) => d.claim),
    ["complete_and_accurate", "no_data_gaps"],
  );
  assert.equal(f.ldar, undefined);
  assertEvidence(pkg, f);
});

test("East (DEC-EDF-CPF1): heuristic facts match the documents", async () => {
  const pkg = await load(EAST);
  const f = await extractDocumentFacts(pkg, DEMO);
  assert.deepEqual(f.warnings, []);
  assert.equal(f.calibration.length, 3);
  for (const c of f.calibration) {
    assert.equal(c.result, "PASS");
    assert.ok(c.calibratedOn! <= "2025-03-31" && c.nextDue! >= "2026-01-01", `${c.tag} valid through 2025`);
  }
  assert.equal(f.gasAnalysis?.reportNo, "SAL-25-GC-0412");
  assert.equal(f.gasAnalysis?.fuelEfMeanTco2PerTj, 56.86);
  assert.equal(f.verification?.opinion, "unmodified");
  assert.equal(f.verification?.reference, "KVS-25-094");
  assert.deepEqual(f.verification?.scopeExclusions, []);
  assert.deepEqual(
    f.verification?.findings.map((x) => [x.id, x.status]),
    [
      ["F-01", "resolved"],
      ["F-02", "open"],
    ],
  );
  assert.equal(f.monitoringPlan?.revision, "4.0");
  assert.match(f.monitoringPlan?.statements.find((s) => s.topic === "methane_method")?.text ?? "", /All methane sources .* quantified/);
  assert.equal(f.monitoringPlan?.statements.some((s) => s.topic === "tank_venting"), false);
  assert.equal(f.coverLetter?.reportedTotalTco2e, 242693);
  assert.equal(f.coverLetter?.date, "2026-03-18");
  assert.deepEqual(
    f.coverLetter?.declarations.map((d) => d.claim),
    ["complete_and_accurate", "other"],
  );
  const ldar = f.ldar!;
  assert.equal(ldar.contractor, "ClearSight OGI Surveys LLC");
  assert.deepEqual(
    ldar.surveys.map((s) => [s.period, s.surveyedOn, s.componentsSurveyed, s.leaksFound, s.leaksRepaired, s.ch4T]),
    [
      ["Q1", "2025-02-24", 9412, 31, 31, 16.2],
      ["Q2", "2025-05-19", 9455, 27, 26, 21.4],
      ["Q3", "2025-08-18", 9470, 24, 24, 19.8],
      ["Q4", "2025-11-17", 9470, 19, 19, 16.6],
    ],
  );
  assert.equal(ldar.annualCh4T, 74);
  assertEvidence(pkg, f);
});

test("demo extraction takes under 100 ms per package", async () => {
  for (const folder of [SOUTH, EAST]) {
    const pkg = await load(folder);
    const t = performance.now();
    await extractDocumentFacts(pkg, DEMO);
    const ms = performance.now() - t;
    assert.ok(ms < 100, `${folder} took ${ms.toFixed(1)} ms`);
  }
});

type Responder = (schemaName: string) => unknown;

function fakeClient(respond: Responder, calls: JsonChatOptions<unknown>[] = []): OpenRouterClient {
  return {
    model: "fake/model",
    async chat() {
      throw new Error("chat() is not used by extraction");
    },
    async chatJson<T>(options: JsonChatOptions<T>) {
      calls.push(options as JsonChatOptions<unknown>);
      const data = options.schema.parse(respond(options.schemaName));
      return { content: JSON.stringify(data), model: "fake/model-1", data };
    },
  };
}

const none = { value: null, page: null, quote: null };
const SOUTH_LLM: Record<string, unknown> = {
  calibration_facts: {
    certificates: [
      // Valid: non-ISO date is normalised, result case normalised.
      { tag: "FT-3001", service: "Fuel gas header", certificateNo: "GCS-CAL-25-0117", calibratedOn: "2025-01-18", nextDue: "31 January 2026", result: "Pass", page: 1, quote: "Next calibration due 31 January 2026" },
      // Wrong quote: falls back to the heuristic certificate.
      { tag: "FT-5101", service: "HP flare header", certificateNo: "GCS-CAL-24-0562", calibratedOn: "2024-05-28", nextDue: "2025-06-30", result: "PASS", page: 2, quote: "Next calibration due 30 June 2025" },
      // Bad date: falls back to the heuristic date; quote differs only in case and spacing.
      { tag: "FT-5102", service: "LP flare header", certificateNo: "GCS-CAL-25-0188", calibratedOn: "2025-02-30", nextDue: "2026-02-28", result: "PASS", page: 3, quote: "DATE OF CALIBRATION   10 February 2025" },
    ],
  },
  verification_facts: {
    reference: { value: "KVS-25-117", page: 1, quote: "Statement reference KVS-25-117" },
    date: { value: "24 March 2026", page: 1, quote: "Date of statement 24 March 2026" },
    body: { value: "Kestrel Verification Services LLC", page: 1, quote: "Verification Services LLC" },
    opinion: { value: "adverse", page: 2, quote: "Adverse opinion. We could not rely on the report." },
    assuranceLevel: { value: "Reasonable", page: 1, quote: "Reasonable assurance / 5% of total reported emissions" },
    materialityPct: { value: "5%", page: 1, quote: "5% of total reported emissions" },
    scopeExclusions: { ids: ["M-04 to M-08"], page: 1, quote: "Methane sources M-04 to M-08 (storage tanks, TEG still vent, pneumatic controllers" },
    findings: [
      { id: "F-01", description: "IPCC default fuel gas emission factor used instead of the site-specific factor", status: "Open", impactTco2e: "3,084", page: 2, quote: "Understatement 3,084 t CO2 (1.1% of total)" },
      { id: "F-03", description: "FT-5101 calibration expired", status: "unresolved", impactTco2e: null, page: 9, quote: "F-03 Non-conformity, unresolved" },
    ],
  },
  cover_letter_facts: {
    reference: { value: "DEC/SDF/HSE/2026/0330", page: 1, quote: "Our ref: DEC/SDF/HSE/2026/0330" },
    date: { value: "2026-03-30", page: 1, quote: "Date: 30 March 2026" },
    reportedTotalTco2e: { value: "274,896", page: 1, quote: "Total Scope 1 emissions 274,896 t CO2e" },
    declarations: [
      { claim: "complete_and_accurate", text: "We confirm that the enclosed report is complete and accurate.", page: 1, quote: "We confirm that the enclosed report is complete and accurate" },
      { claim: "No data gaps", text: "No data gaps occurred during the reporting period.", page: 1, quote: "No data gaps occurred during the reporting period." },
    ],
  },
  gas_analysis_facts: {
    reportNo: none,
    issuedOn: none,
    samples: [],
    fuelEfMeanTco2PerTj: none,
    fuelNcvMeanMjPerSm3: none,
    flareCo2FactorTPer1000Sm3: none,
    flareCh4FactorTPer1000Sm3: none,
  },
};

test("live mode: LLM output is validated, normalised and falls back to heuristics", async () => {
  const pkg = await load(SOUTH);
  const demo = await extractDocumentFacts(pkg, DEMO);
  const calls: JsonChatOptions<unknown>[] = [];
  const client = fakeClient((name) => {
    if (name === "monitoring_plan_facts") throw new Error("provider timeout");
    return SOUTH_LLM[name];
  }, calls);
  const f = await extractDocumentFacts(pkg, { mode: "live", client, cacheDir: "" });

  assert.equal(calls.length, 5);
  for (const c of calls) {
    assert.equal(c.temperature, 0);
    assert.match(c.messages.at(-1)?.content ?? "", /=== Page 1 ===/);
  }
  assert.equal(f.extractedBy, "llm");
  assert.equal(f.model, "fake/model-1");

  const cal = Object.fromEntries(f.calibration.map((c) => [c.tag, c]));
  assert.deepEqual([cal["FT-3001"].nextDue, cal["FT-3001"].result], ["2026-01-31", "PASS"]);
  assert.equal(cal["FT-3001"].evidence.quote, "Next calibration due 31 January 2026");
  assert.deepEqual(cal["FT-5101"], demo.calibration.find((c) => c.tag === "FT-5101"));
  assert.equal(cal["FT-5102"].calibratedOn, "2025-02-10");
  assert.equal(cal["FT-5102"].evidence.quote, "Date of calibration 10 February 2025");

  const v = f.verification!;
  assert.equal(v.date, "2026-03-24");
  assert.equal(v.opinion, "qualified");
  assert.equal(v.assuranceLevel, "Reasonable");
  assert.equal(v.materialityPct, 5);
  assert.deepEqual(v.scopeExclusions, ["M-04", "M-05", "M-06", "M-07", "M-08"]);
  const findings = Object.fromEntries(v.findings.map((x) => [x.id, x]));
  assert.deepEqual(Object.keys(findings).sort(), ["F-01", "F-02", "F-03", "F-04"]);
  assert.match(findings["F-01"].description, /IPCC default fuel gas emission factor/);
  assert.equal(findings["F-01"].impactTco2e, 3084);
  assert.deepEqual(findings["F-03"], demo.verification?.findings.find((x) => x.id === "F-03"));

  assert.equal(f.coverLetter?.reportedTotalTco2e, 274896);
  assert.deepEqual(f.coverLetter?.declarations.map((d) => d.claim), ["complete_and_accurate", "no_data_gaps"]);
  assert.deepEqual(f.gasAnalysis, demo.gasAnalysis);
  assert.deepEqual(f.monitoringPlan, demo.monitoringPlan);

  const warned = (re: RegExp) => assert.ok(f.warnings.some((w) => re.test(w)), `missing warning ${re}: ${f.warnings.join(" | ")}`);
  warned(/FT-5101: quote not found on page 2; used the heuristic value/);
  warned(/FT-5102 calibratedOn: date "2025-02-30" is not valid; used the heuristic value/);
  warned(/opinion: quote not found on page 2; used the heuristic value/);
  warned(/finding F-03: page 9 is out of range; used the heuristic value/);
  warned(/Monitoring-Plan.*LLM extraction failed \(provider timeout\); used heuristic extraction/);
  assertEvidence(pkg, f);
});

test("live mode: a failing LLM falls back to the heuristic facts for every document", async () => {
  const pkg = await load(EAST);
  const demo = await extractDocumentFacts(pkg, DEMO);
  const client = fakeClient(() => {
    throw new Error("network down");
  });
  const f = await extractDocumentFacts(pkg, { mode: "live", client, cacheDir: "" });
  assert.equal(f.extractedBy, "heuristic");
  assert.equal(f.model, undefined);
  assert.equal(f.warnings.filter((w) => /LLM extraction failed \(network down\)/.test(w)).length, 6);
  assert.deepEqual({ ...f, warnings: [] }, { ...demo, warnings: [] });
});

test("never throws on missing, empty or unusual documents", async () => {
  const doc = (id: string, kind: DocumentKind): SubmissionDocument => ({
    id,
    fileName: `${id}.pdf`,
    relativePath: `${id}.pdf`,
    kind,
    mediaType: "application/pdf",
    sizeBytes: 0,
    sha256: "",
  });
  const pkg: SubmissionPackage = {
    submissionId: "odd",
    source: "upload",
    rootDir: "/tmp",
    documents: [
      doc("a", "verification_statement"),
      doc("b", "calibration_certificates"),
      doc("c", "monitoring_plan"),
      doc("d", "ldar_survey"),
      doc("e", "cover_letter"),
      doc("f", "gas_analysis_certificate"),
      doc("g", "other"),
    ],
    pdfText: {
      b: [{ page: 1, text: "Lorem ipsum dolor sit amet" }],
      c: [{ page: 1, text: "   " }],
      d: [{ page: 1, text: "Nothing to see 12 34\nTotal 9,470" }],
      e: [{ page: 1, text: "Dear Sir or Madam," }],
      f: [{ page: 1, text: "Report number" }],
    },
    evidence: {},
    warnings: [],
    loadedInMs: 0,
  };
  for (const ctx of [DEMO, { mode: "live", cacheDir: "" } satisfies AiContext]) {
    const f = await extractDocumentFacts(pkg, ctx);
    assert.deepEqual(f.calibration, []);
    assert.equal(f.verification, undefined);
    assert.equal(f.monitoringPlan, undefined);
    assert.deepEqual(f.ldar?.surveys, []);
    assert.equal(f.ldar?.annualCh4T, undefined);
    assert.deepEqual(f.coverLetter?.declarations, []);
    assert.deepEqual(f.gasAnalysis?.samples, []);
    assert.ok(f.warnings.some((w) => /^a\.pdf: no text/.test(w)));
    assert.ok(f.warnings.some((w) => /^b\.pdf: no calibration certificate recognised/.test(w)));
  }
});

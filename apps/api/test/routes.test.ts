import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test, type TestContext } from "node:test";
import type {
  AuditEvent,
  DashboardResponse,
  DecisionResponse,
  DocumentTextResponse,
  HealthResponse,
  Letter,
  Review,
  ReviewAllResponse,
  SubmissionDetail,
  SubmissionSummary,
} from "@zerocarbon/shared";
import { createApp } from "../src/app.ts";
import { contentDisposition } from "../src/routes/submissions.ts";
import { truncateText } from "../src/services/documents.ts";
import type { MapResponse } from "../src/services/map.ts";
import { createMemoryStore } from "../src/store/store.ts";
import { createFakeAi, fakeRules } from "./fixtures/fake-ai.ts";
import { createFakeCatalog, NORTH, SOUTH } from "./fixtures/fake-catalog.ts";
import { createFakePipeline } from "./fixtures/fake-pipeline.ts";

async function start(t: TestContext, { maxUploadMb = 5, delayMs = 30 } = {}) {
  t.mock.method(console, "error", () => {});
  const catalog = createFakeCatalog();
  const pipeline = createFakePipeline(delayMs);
  const ai = createFakeAi();
  const store = createMemoryStore();
  const app = createApp({ version: "9.9.9", aiMode: "demo", model: "test/model", maxUploadMb, catalog, pipeline, store, ai, rules: fakeRules });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;

  async function call<T = any>(method: string, path: string, body?: unknown) {
    const init: RequestInit = { method };
    if (body instanceof FormData) init.body = body;
    else if (typeof body === "string") init.body = body;
    else if (body !== undefined) init.body = JSON.stringify(body);
    if (body !== undefined && !(body instanceof FormData)) init.headers = { "Content-Type": "application/json" };
    const res = await fetch(base + path, init);
    const text = await res.text();
    const json = res.headers.get("content-type")?.includes("json") && text ? JSON.parse(text) : undefined;
    return { status: res.status, body: json as T, text, headers: res.headers };
  }
  const get = <T = any>(path: string) => call<T>("GET", path);
  const post = <T = any>(path: string, body?: unknown) => call<T>("POST", path, body);
  const patch = <T = any>(path: string, body?: unknown) => call<T>("PATCH", path, body);
  const ids = async (query = "") => (await get<SubmissionSummary[]>(`/submissions${query}`)).body.map((s) => s.id);
  return { catalog, pipeline, ai, store, get, post, patch, ids };
}

const officer = { officerName: "  Fatima Al Mansoori  " };

test("health reports version, mode and submission count", async (t) => {
  const { get } = await start(t);
  const { status, body } = await get<HealthResponse>("/health");
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.service, "zerocarbon-api");
  assert.equal(body.version, "9.9.9");
  assert.equal(body.aiMode, "demo");
  assert.equal(body.model, "test/model");
  assert.equal(body.submissionCount, 2);
  assert.ok(Date.parse(body.time));
});

test("errors: unknown routes, unknown ids and malformed JSON", async (t) => {
  const { get, post, patch } = await start(t);
  const unknownRoute = await get("/nope");
  assert.equal(unknownRoute.status, 404);
  assert.match(unknownRoute.body.error, /No API route for GET \/api\/nope/);
  assert.equal((await post("/health")).status, 404);

  const malformed = await post(`/submissions/${SOUTH}/decision`, "{ bad json");
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error, "Malformed JSON body");

  for (const path of ["/submissions/missing", "/submissions/missing/review", "/submissions/missing/letters", "/submissions/missing/documents/flare-log", "/submissions/missing/documents/flare-log/text", "/letters/missing", "/regulations/missing"]) {
    const res = await get(path);
    assert.equal(res.status, 404, path);
    assert.equal(typeof res.body.error, "string");
  }
  assert.equal((await post("/submissions/missing/review")).status, 404);
  assert.equal((await post("/submissions/missing/decision", { action: "approve", ...officer })).status, 404);
  assert.equal((await post("/submissions/missing/letters", { action: "approve" })).status, 404);
  assert.equal((await post("/submissions/missing/ask", { question: "What is wrong?" })).status, 404);
  assert.equal((await patch("/letters/missing", { status: "draft" })).status, 404);
  assert.equal((await get(`/submissions/${SOUTH}/documents/missing`)).status, 404);
  assert.equal((await get(`/submissions/${SOUTH}/documents/missing/text`)).status, 404);
  assert.equal((await get(`/submissions/${SOUTH}/review`)).status, 404, "no review yet");
});

test("inbox sorting, filters and stage transitions", async (t) => {
  const { get, post, ids } = await start(t);
  const initial = (await get<SubmissionSummary[]>("/submissions")).body;
  assert.deepEqual(initial.map((s) => [s.id, s.stage]), [[SOUTH, "not_reviewed"], [NORTH, "not_reviewed"]], "not reviewed: newest first");
  assert.equal(initial[0].reportedTotalTco2e, 1_000_000);
  assert.equal(initial[0].riskScore, undefined);
  assert.equal((initial[0] as any).rootDir, undefined, "internal paths are not exposed");

  await post(`/submissions/${NORTH}/review`);
  assert.deepEqual(await ids(), [NORTH, SOUTH], "reviewed items come first");

  const review = (await post<Review>(`/submissions/${SOUTH}/review`)).body;
  assert.equal(review.riskScore, 88);
  assert.deepEqual(await ids(), [SOUTH, NORTH], "highest risk first");
  const south = (await get<SubmissionSummary[]>("/submissions")).body[0];
  assert.equal(south.stage, "reviewed");
  assert.equal(south.status, "non_compliant");
  assert.equal(south.riskBand, "critical");
  assert.equal(south.findingCount, 2);
  assert.equal(south.estimatedUnderReportingTco2e, 120_000);
  assert.equal(south.reviewedAt, review.createdAt);
  assert.deepEqual((await get(`/submissions/${SOUTH}/review`)).body.id, review.id);

  await post(`/submissions/${SOUTH}/decision`, { action: "escalate_inspection", ...officer });
  const decided = (await get<SubmissionSummary[]>("/submissions")).body[0];
  assert.equal(decided.stage, "decided");
  assert.equal(decided.decision, "escalate_inspection");

  assert.deepEqual(await ids("?status=compliant"), [NORTH]);
  assert.deepEqual(await ids("?stage=decided"), [SOUTH]);
  assert.deepEqual(await ids("?q=northern"), [NORTH]);
  assert.deepEqual(await ids("?q=ad-og-0417"), [SOUTH]);
  assert.deepEqual(await ids("?q=desert%20energy"), [SOUTH]);
  assert.equal((await get("/submissions?status=bogus")).status, 400);
});

test("submission detail merges package, review, decisions and letters", async (t) => {
  const { get, post } = await start(t);
  const before = (await get<SubmissionDetail>(`/submissions/${SOUTH}`)).body;
  assert.equal(before.documents.length, 3);
  assert.equal(before.report?.facility.eadId, "AD-OG-0417");
  assert.equal(before.review, undefined);
  assert.deepEqual(before.decisions, []);
  assert.deepEqual(before.letters, []);

  await post(`/submissions/${SOUTH}/review`);
  const { body } = await post<DecisionResponse>(`/submissions/${SOUTH}/decision`, { action: "request_clarification", ...officer });
  const after = (await get<SubmissionDetail>(`/submissions/${SOUTH}`)).body;
  assert.equal(after.stage, "decided");
  assert.equal(after.review?.riskScore, 88);
  assert.deepEqual(after.decisions.map((d) => d.id), [body.decision.id]);
  assert.deepEqual(after.letters.map((l) => l.id), [body.letter?.id]);
});

test("concurrent review requests share one pipeline run", async (t) => {
  const { get, post, pipeline, store } = await start(t, { delayMs: 150 });
  const pending = [post<Review>(`/submissions/${SOUTH}/review`), post<Review>(`/submissions/${SOUTH}/review`)];
  while (!pipeline.calls.length) await new Promise((r) => setTimeout(r, 2));
  const during = (await get<SubmissionSummary[]>("/submissions")).body.find((s) => s.id === SOUTH);
  assert.equal(during?.stage, "reviewing");
  const [a, b] = await Promise.all(pending);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.equal(a.body.id, b.body.id);
  assert.deepEqual(pipeline.calls, [SOUTH]);
  assert.equal(store.listReviews(SOUTH).length, 1);
  const audit = (await get<AuditEvent[]>(`/audit?submissionId=${SOUTH}`)).body.map((e) => e.type);
  assert.deepEqual(audit, ["review_completed", "review_started"]);
});

test("a failed review marks the submission failed until a successful run", async (t) => {
  const { get, post, pipeline } = await start(t);
  pipeline.failIds.add(NORTH);
  const failed = await post(`/submissions/${NORTH}/review`);
  assert.equal(failed.status, 500);
  assert.match(failed.body.error, /Review failed: Workbook could not be parsed/);
  const summary = (await get<SubmissionSummary[]>("/submissions?stage=failed")).body;
  assert.deepEqual(summary.map((s) => s.id), [NORTH]);
  assert.equal((await get<AuditEvent[]>("/audit?limit=1")).body[0].type, "review_failed");

  pipeline.failIds.clear();
  assert.equal((await post(`/submissions/${NORTH}/review`)).status, 200);
  assert.deepEqual((await get<SubmissionSummary[]>("/submissions?stage=reviewed")).body.map((s) => s.id), [NORTH]);
});

test("run-all reviews pending submissions and reports durations", async (t) => {
  const { post, pipeline } = await start(t);
  pipeline.failIds.add(NORTH);
  const first = (await post<ReviewAllResponse>("/reviews/run-all")).body;
  assert.equal(first.reviewed, 1);
  assert.equal(first.failed, 1);
  assert.deepEqual(first.results.map((r) => r.submissionId), [SOUTH, NORTH]);
  assert.equal(first.results[0].status, "non_compliant");
  assert.equal(first.results[0].riskScore, 88);
  assert.match(first.results[1].error ?? "", /Workbook could not be parsed/);
  assert.ok(first.durationMs >= 25, `durationMs ${first.durationMs}`);
  assert.ok(first.results.every((r) => r.durationMs >= 25 && r.durationMs <= first.durationMs));
  assert.equal(pipeline.maxConcurrent, 2, "runs two at a time");

  pipeline.failIds.clear();
  const second = (await post<ReviewAllResponse>("/reviews/run-all")).body;
  assert.deepEqual(second.results.map((r) => r.submissionId), [NORTH], "only the unreviewed one");
  assert.equal(second.reviewed, 1);

  const none = (await post<ReviewAllResponse>("/reviews/run-all")).body;
  assert.deepEqual([none.reviewed, none.failed, none.results.length], [0, 0, 0]);

  const forced = (await post<ReviewAllResponse>("/reviews/run-all?force=true")).body;
  assert.equal(forced.reviewed, 2);
  assert.equal(pipeline.calls.length, 5);
});

test("decisions: validation, 409 before review, letter drafting", async (t) => {
  const { post, ai, store } = await start(t);
  const url = `/submissions/${SOUTH}/decision`;
  for (const body of [{}, { action: "approve" }, { action: "ignore", ...officer }, { action: "approve", officerName: "   " }, { action: "approve", officerName: "x".repeat(81) }, { action: "approve", ...officer, draftLetter: "no" }]) {
    const res = await post(url, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.error, "Invalid request");
    assert.ok(Array.isArray(res.body.details));
  }
  const early = await post(url, { action: "approve", ...officer });
  assert.equal(early.status, 409);

  const review = (await post<Review>(`/submissions/${SOUTH}/review`)).body;
  const { status, body } = await post<DecisionResponse>(url, { action: "refer_penalty", ...officer, note: " Repeat offender " });
  assert.equal(status, 201);
  assert.equal(body.decision.officerName, "Fatima Al Mansoori");
  assert.equal(body.decision.note, "Repeat offender");
  assert.equal(body.decision.reviewId, review.id);
  assert.equal(body.decision.letterId, body.letter?.id);
  assert.equal(body.letter?.status, "draft");
  assert.equal(body.letter?.action, "refer_penalty");
  assert.equal(body.letter?.reference, "EAD/MRV/2026/AD-OG-0417/Q1");

  const input = ai.letterCalls[0];
  assert.equal(input.officerName, "Fatima Al Mansoori");
  assert.equal(input.review.id, review.id);
  assert.equal(input.rules.length, 2);
  assert.deepEqual(input.identity, {
    submissionId: SOUTH,
    facilityName: "Southern Dunes Central Processing Facility 2",
    facilityShortName: "Southern Dunes CPF-2",
    operator: "Desert Energy Company",
    operatorAr: "شركة الطاقة الصحراوية",
    eadId: "AD-OG-0417",
    permit: "EAD-PER-AD-OG-0417",
    reportingYear: 2025,
    submittedOn: "2026-03-28",
    contactName: "Dr. Layla Haddad",
  });

  const noLetter = await post<DecisionResponse>(url, { action: "approve", ...officer, draftLetter: false });
  assert.equal(noLetter.status, 201);
  assert.equal(noLetter.body.letter, undefined);
  assert.equal(ai.letterCalls.length, 1);
  assert.equal(store.getLatestDecision(SOUTH)?.action, "approve");
  assert.deepEqual(
    store.listAudit({ submissionId: SOUTH, limit: 3 }).map((e) => e.type),
    ["decision_recorded", "decision_recorded", "letter_drafted"],
  );
});

test("letters: draft without decision, edit, approve, locked after approval", async (t) => {
  const { get, post, patch } = await start(t);
  assert.equal((await post(`/submissions/${NORTH}/letters`, { action: "approve" })).status, 409, "needs a review");
  await post(`/submissions/${NORTH}/review`);
  assert.equal((await post(`/submissions/${NORTH}/letters`, { action: "maybe" })).status, 400);

  const created = await post<Letter>(`/submissions/${NORTH}/letters`, { action: "approve" });
  assert.equal(created.status, 201);
  const letter = created.body;
  assert.equal(letter.status, "draft");
  assert.deepEqual((await get<Letter[]>(`/submissions/${NORTH}/letters`)).body.map((l) => l.id), [letter.id]);
  assert.equal((await get<SubmissionSummary[]>("/submissions")).body.find((s) => s.id === NORTH)?.stage, "reviewed", "a letter alone is not a decision");

  assert.equal((await patch(`/letters/${letter.id}`, {})).status, 400);
  assert.equal((await patch(`/letters/${letter.id}`, { en: { subject: "", body: "x" } })).status, 400);
  const noName = await patch(`/letters/${letter.id}`, { status: "approved" });
  assert.equal(noName.status, 400);

  const edited = await patch<Letter>(`/letters/${letter.id}`, { en: { subject: "Edited", body: "New body" }, ...officer });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.en.subject, "Edited");
  assert.equal(edited.body.ar.subject, letter.ar.subject);
  assert.equal(edited.body.status, "draft");

  const approved = await patch<Letter>(`/letters/${letter.id}`, { status: "approved", ...officer });
  assert.equal(approved.body.status, "approved");
  assert.equal(approved.body.approvedBy, "Fatima Al Mansoori");
  assert.ok(approved.body.approvedAt);
  assert.equal((await get<Letter>(`/letters/${letter.id}`)).body.status, "approved");

  const locked = await patch(`/letters/${letter.id}`, { ar: { subject: "جديد", body: "نص" } });
  assert.equal(locked.status, 409);
  const audit = (await get<AuditEvent[]>(`/audit?submissionId=${NORTH}&limit=3`)).body.map((e) => e.type);
  assert.deepEqual(audit, ["letter_approved", "letter_updated", "letter_drafted"]);
});

test("ask passes identity, review, package and rules to the AI", async (t) => {
  const { post, ai } = await start(t);
  assert.equal((await post(`/submissions/${SOUTH}/ask`, { question: "hi" })).status, 400);
  assert.equal((await post(`/submissions/${SOUTH}/ask`, { question: "x".repeat(501) })).status, 400);
  const before = await post(`/submissions/${SOUTH}/ask`, { question: "  Why is the risk high?  " });
  assert.equal(before.status, 200);
  assert.equal(ai.askCalls[0].review, undefined);
  assert.equal(ai.askCalls[0].question, "Why is the risk high?");

  await post(`/submissions/${SOUTH}/review`);
  const { body } = await post(`/submissions/${SOUTH}/ask`, { question: "Which rows are estimated?" });
  assert.match(body.answer, /Southern Dunes CPF-2/);
  assert.equal(body.citations[0].documentId, "flare-log");
  const input = ai.askCalls[1];
  assert.equal(input.review?.riskScore, 88);
  assert.equal(input.pkg?.submissionId, SOUTH);
  assert.equal(input.rules.length, 2);
  assert.equal(input.identity.operatorAr, "شركة الطاقة الصحراوية");
});

test("upload via multipart with JSON paths, then immediate review", async (t) => {
  const { post, catalog, get } = await start(t);
  const form = new FormData();
  form.append("files", new Blob(["PK xlsx bytes"], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "Report_2025.xlsx");
  form.append("files", new Blob(["date,value\n2025-01-01,1\n"], { type: "text/csv" }), "Flare-Log é.csv");
  form.append("paths", JSON.stringify(["Report_2025.xlsx", "evidence\\sub/../Flare-Log é.csv"]));
  const res = await post<SubmissionSummary>("/submissions?review=true", form);
  assert.equal(res.status, 201, res.text);
  assert.equal(res.body.id, "upload-1");
  assert.equal(res.body.source, "upload");
  assert.equal(res.body.stage, "reviewed");
  assert.equal(res.body.riskScore, 45);

  const [files] = catalog.uploads;
  assert.deepEqual(
    files.map((f) => [f.originalName, f.relativePath, f.mediaType, f.buffer.toString("utf8")]),
    [
      ["Report_2025.xlsx", "Report_2025.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "PK xlsx bytes"],
      ["Flare-Log é.csv", "evidence/sub/Flare-Log é.csv", "text/csv", "date,value\n2025-01-01,1\n"],
    ],
  );
  assert.equal((await get<AuditEvent[]>("/audit")).body.at(-1)?.type, "submission_received");
  assert.equal((await get<HealthResponse>("/health")).body.submissionCount, 3);
});

test("upload: repeated paths fields, validation and size limit", async (t) => {
  const { post, catalog } = await start(t, { maxUploadMb: 1 });
  const form = new FormData();
  form.append("files", new Blob(["a"]), "report.xlsx");
  form.append("files", new Blob(["b"]), "cover.pdf");
  form.append("paths", "pkg/report.xlsx");
  form.append("paths", "pkg/evidence/cover.pdf");
  const ok = await post<SubmissionSummary>("/submissions", form);
  assert.equal(ok.status, 201, ok.text);
  assert.equal(ok.body.stage, "not_reviewed");
  assert.deepEqual(catalog.uploads[0].map((f) => f.relativePath), ["pkg/report.xlsx", "pkg/evidence/cover.pdf"]);

  assert.equal((await post("/submissions", new FormData())).status, 400, "no files");
  assert.equal((await post("/submissions", { files: [] })).status, 400, "not multipart");

  const mismatch = new FormData();
  mismatch.append("files", new Blob(["a"]), "report.xlsx");
  mismatch.append("paths", JSON.stringify(["a", "b"]));
  assert.equal((await post("/submissions", mismatch)).status, 400);

  const noWorkbook = new FormData();
  noWorkbook.append("files", new Blob(["a"]), "notes.txt");
  const rejected = await post("/submissions", noWorkbook);
  assert.equal(rejected.status, 400);
  assert.match(rejected.body.error, /workbook/);

  const tooBig = new FormData();
  tooBig.append("files", new Blob([new Uint8Array(1024 * 1024 + 10)]), "report.xlsx");
  assert.equal((await post("/submissions", tooBig)).status, 413);

  const wrongField = new FormData();
  wrongField.append("attachment", new Blob(["a"]), "report.xlsx");
  assert.equal((await post("/submissions", wrongField)).status, 400);
  assert.equal(catalog.uploads.length, 2, "only the valid and the no-workbook requests reach the catalog");
});

test("document download headers and text rendering", async (t) => {
  const { get } = await start(t);
  const pdf = await get(`/submissions/${SOUTH}/documents/verification-statement`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assert.equal(pdf.headers.get("x-content-type-options"), "nosniff");
  assert.equal(
    pdf.headers.get("content-disposition"),
    `inline; filename="Verification Statement _ Gulf Assurance.pdf"; filename*=UTF-8''Verification%20Statement%20%E2%80%93%20Gulf%20Assurance.pdf`,
  );
  assert.equal(pdf.text, "%PDF-1.7 fake");
  const csv = await get(`/submissions/${SOUTH}/documents/flare-log`);
  assert.equal(csv.headers.get("content-type"), "text/csv; charset=utf-8");
  const xlsx = await get(`/submissions/${SOUTH}/documents/emissions-report`);
  assert.equal(xlsx.headers.get("content-type"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.match(xlsx.headers.get("content-disposition") ?? "", /^inline; filename="AD-OG-0417_Emissions-Report_2025\.xlsx"/);

  const pdfText = (await get<DocumentTextResponse>(`/submissions/${SOUTH}/documents/verification-statement/text`)).body;
  assert.equal(pdfText.kind, "verification_statement");
  assert.deepEqual(pdfText.pages.map((p) => p.page), [1, 2]);
  const csvText = (await get<DocumentTextResponse>(`/submissions/${SOUTH}/documents/flare-log/text`)).body;
  assert.equal(csvText.pages.length, 1);
  assert.ok(csvText.pages[0].text.startsWith("date,hp_sm3,lp_sm3\n"), "BOM stripped");
  const xlsxText = (await get<DocumentTextResponse>(`/submissions/${SOUTH}/documents/emissions-report/text`)).body;
  assert.match(xlsxText.pages[0].text, /## Operator\n\{\n {2}"name": "Desert Energy Company"/);
  assert.doesNotMatch(xlsxText.pages[0].text, /"evidence"/);
});

test("text truncation and content-disposition helpers", () => {
  const text = Array.from({ length: 100 }, (_, i) => `row-${i}`).join("\n");
  const cut = truncateText(text, 50);
  assert.ok(cut.startsWith("row-0\nrow-1\n"));
  assert.match(cut, /\[Truncated: showing the first \d+ of 100 lines\./);
  assert.equal(truncateText("short", 50), "short");
  assert.equal(contentDisposition("attachment", 'a"b\\c.txt'), `attachment; filename="a_b_c.txt"; filename*=UTF-8''a%22b%5Cc.txt`);
  assert.equal(contentDisposition("inline", "تقرير (1).pdf"), `inline; filename="_____ (1).pdf"; filename*=UTF-8''%D8%AA%D9%82%D8%B1%D9%8A%D8%B1%20%281%29.pdf`);
});

test("dashboard aggregates counts, totals and top risks", async (t) => {
  const { get, post } = await start(t);
  const empty = (await get<DashboardResponse>("/dashboard")).body;
  assert.equal(empty.reviewed, 0);
  assert.equal(empty.averageReviewMs, undefined);
  assert.equal(empty.byStage.not_reviewed, 2);

  await post("/reviews/run-all");
  await post(`/submissions/${SOUTH}/decision`, { action: "escalate_inspection", ...officer });
  const d = (await get<DashboardResponse>("/dashboard")).body;
  assert.equal(d.reportingYear, 2025);
  assert.equal(d.submissions, 2);
  assert.equal(d.reviewed, 2);
  assert.deepEqual(d.byStatus, { compliant: 1, needs_clarification: 0, non_compliant: 1 });
  assert.deepEqual(d.byStage, { not_reviewed: 0, reviewing: 0, reviewed: 1, decided: 1, failed: 0 });
  assert.deepEqual(d.decisions, { approve: 0, request_clarification: 0, escalate_inspection: 1, refer_penalty: 0 });
  assert.equal(d.totalReportedTco2e, 1_500_000);
  assert.equal(d.estimatedUnderReportingTco2e, 120_000);
  assert.equal(d.averageReviewMs, 1200);
  assert.deepEqual(d.topRisks.map((s) => s.id), [SOUTH, NORTH]);
  assert.equal(d.aiMode, "demo");
});

test("map returns submissions, peers, detections and plumes as GeoJSON", async (t) => {
  const { get, post } = await start(t);
  await post(`/submissions/${SOUTH}/review`);
  const map = (await get<MapResponse>("/map")).body;
  assert.equal(map.type, "FeatureCollection");
  const byKind = (kind: string) => map.features.filter((f) => f.properties.kind === kind);

  const subs = byKind("submission");
  assert.equal(subs.length, 2);
  const south = subs.find((f) => f.properties.submissionId === SOUTH)!;
  assert.deepEqual(south.geometry, { type: "Point", coordinates: [53.6, 23.1] });
  assert.equal(south.properties.riskScore, 88);
  assert.equal(south.properties.riskBand, "critical");
  assert.equal(south.properties.stage, "reviewed");
  assert.equal(south.properties.reportedTotalTco2e, 1_000_000);
  const north = subs.find((f) => f.properties.submissionId === NORTH)!;
  assert.deepEqual(north.geometry.coordinates, [54.1, 24.2], "falls back to reference facility coordinates");

  const peers = byKind("peer");
  assert.deepEqual(peers.map((f) => f.properties.eadId), ["AD-OG-0901"], "submitted facilities are not repeated as peers");
  assert.equal(peers[0].properties.intensity, 20, "latest peer year wins");
  assert.equal(peers[0].properties.verificationOpinion, "unmodified");

  const [detection] = byKind("detection");
  assert.equal(detection.properties.id, "DET-01");
  assert.equal(detection.properties.simulated, true);
  assert.equal(detection.properties.submissionId, SOUTH);
  assert.equal(detection.properties.plumePolygon, undefined);
  assert.deepEqual(detection.geometry.coordinates, [53.602, 23.101]);

  const [plume] = byKind("plume");
  assert.equal(plume.geometry.type, "Polygon");
  assert.equal(plume.properties.detectionId, "DET-01");
});

test("regulations and audit endpoints", async (t) => {
  const { get, post } = await start(t);
  const rules = (await get("/regulations")).body;
  assert.equal(rules.length, 2);
  assert.equal((await get("/regulations/EAD-TGD-DATA-GAPS")).body.title, "Data gaps");

  await post("/reviews/run-all");
  const audit = (await get<AuditEvent[]>("/audit")).body;
  assert.equal(audit.length, 4);
  assert.ok(audit.every((e) => e.id && e.createdAt && e.actor === "system"));
  assert.equal((await get("/audit?limit=2")).body.length, 2);
  assert.equal((await get("/audit?limit=0")).status, 400);
});

test("demo reset clears reviews, decisions, letters and failures", async (t) => {
  const { get, post, pipeline, store } = await start(t);
  pipeline.failIds.add(NORTH);
  await post("/reviews/run-all");
  await post(`/submissions/${SOUTH}/decision`, { action: "approve", ...officer });
  const res = await post("/demo/reset");
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
  assert.equal(res.body.cleared.decisions, 1);
  assert.deepEqual(
    (await get<SubmissionSummary[]>("/submissions")).body.map((s) => s.stage),
    ["not_reviewed", "not_reviewed"],
  );
  assert.deepEqual((await get<AuditEvent[]>("/audit")).body.map((e) => e.type), ["demo_reset"]);
  assert.deepEqual(store.listLetters(), []);
  assert.equal((await post("/demo/reset", { keepUploads: "yes" })).status, 400);
});

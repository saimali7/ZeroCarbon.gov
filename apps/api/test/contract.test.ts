import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import type { DecisionResponse, Review, ReviewAllResponse, SubmissionDetail, SubmissionSummary } from "@zerocarbon/shared";
import { apiRoutes } from "@zerocarbon/shared/routes";
import { createApp } from "../src/app.ts";
import { createContainer, version } from "../src/container.ts";
import { getRule, listRules } from "../src/regulations/index.ts";
import { createMemoryStore } from "../src/store/store.ts";

// The real app (demo mode, in-memory store) answers every route the web client builds from apiRoutes.
test("the API implements the web client's route contract", async (t) => {
  const container = createContainer({ aiMode: "demo" });
  const app = createApp({
    version,
    aiMode: "demo",
    maxUploadMb: 50,
    catalog: container.catalog,
    pipeline: container.pipeline,
    store: createMemoryStore(),
    ai: container.aiServices,
    rules: { list: listRules, get: getRule },
  });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async <T>(path: string, init?: RequestInit) => {
    const res = await fetch(base + path, init);
    return { status: res.status, body: (await res.json()) as T };
  };
  const post = <T>(path: string, body?: unknown) =>
    call<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

  assert.equal((await call(apiRoutes.health())).status, 200);
  const inbox = await call<SubmissionSummary[]>(apiRoutes.submissions());
  assert.equal(inbox.status, 200);
  const south = inbox.body.find((s) => s.eadId === "AD-OG-0417")!;

  const all = await post<ReviewAllResponse>(apiRoutes.reviewAll());
  assert.equal(all.body.reviewed, inbox.body.length);
  assert.equal((await post<Review>(apiRoutes.review(south.id))).body.status, "non_compliant");

  const detail = await call<SubmissionDetail>(apiRoutes.submission(south.id));
  assert.ok(detail.body.evidence?.flareLog?.days.length, "detail carries parsed evidence");
  const satellite = detail.body.review!.findings.find((f) => f.category === "satellite")!;
  const refDoc = satellite.evidence.find((e) => e.documentId.startsWith("ref-"));
  assert.ok(refDoc, "satellite finding cites regulator reference data");
  assert.equal((await fetch(base + apiRoutes.document(south.id, refDoc.documentId))).status, 200);
  assert.equal((await call(apiRoutes.documentText(south.id, refDoc.documentId))).status, 200);
  const workbook = detail.body.documents.find((d) => d.kind === "emissions_report")!;
  const workbookText = await call<{ pages: { text: string }[] }>(apiRoutes.documentText(south.id, workbook.id));
  assert.match(workbookText.body.pages[0].text, /D2_Calculation_Approach/);

  assert.equal((await post(apiRoutes.ask(south.id), { question: "Why is the flare flagged?" })).status, 200);
  const decision = await post<DecisionResponse>(apiRoutes.decisions(south.id), { action: "request_clarification", officerName: "Officer" });
  assert.equal(decision.status, 201);
  const letterId = decision.body.letter!.id;
  assert.equal((await post(apiRoutes.letters(south.id), { action: "escalate_inspection" })).status, 201);
  const patch = (body: unknown) => call(apiRoutes.letter(letterId), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await patch({ status: "approved", officerName: "Officer" })).status, 200);
  assert.equal((await patch({ status: "draft", officerName: "Officer" })).status, 200, "approved letters can be reopened");

  for (const path of [apiRoutes.dashboard(), apiRoutes.reference(), apiRoutes.regulations(), apiRoutes.audit(), apiRoutes.audit(south.id)]) {
    assert.equal((await call(path)).status, 200, path);
  }
  assert.equal((await post(apiRoutes.demoReset())).status, 200);
});

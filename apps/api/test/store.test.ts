import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import type { Letter } from "@zerocarbon/shared";
import { createMemoryStore, createStore, type NewLetter } from "../src/store/store.ts";
import { makeReview } from "./fixtures/fake-pipeline.ts";

const dirs: string[] = [];
const tempDir = async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "zc-store-"));
  dirs.push(dir);
  return dir;
};
after(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

const letterInput = (submissionId: string): NewLetter => ({
  submissionId,
  reviewId: "r1",
  action: "request_clarification",
  en: { subject: "S", body: "B" },
  ar: { subject: "م", body: "ب" },
  reference: "EAD/MRV/2026/X",
  generatedBy: "template",
  status: "draft",
  createdAt: "2026-04-01T00:00:00.000Z",
  updatedAt: "2026-04-01T00:00:00.000Z",
});

test("store persists state across instances", async () => {
  const dir = await tempDir();
  const store = createStore(dir);
  await store.saveReview(makeReview("a", { riskScore: 10 }));
  const latest = await store.saveReview(makeReview("a", { riskScore: 20 }));
  await store.saveReview(makeReview("b"));
  const decision = await store.addDecision({
    submissionId: "a",
    reviewId: latest.id,
    action: "approve",
    officerName: "Officer",
    createdAt: "2026-04-01T00:00:00.000Z",
  });
  const letter = await store.createLetter(letterInput("a"));
  await store.updateLetter(letter.id, { status: "approved", approvedBy: "Officer" });
  await store.appendAudit({ type: "decision_recorded", submissionId: "a", actor: "Officer", message: "one", createdAt: "t1" });
  await store.appendAudit({ type: "letter_approved", submissionId: "a", actor: "Officer", message: "two", createdAt: "t2" });

  const raw = JSON.parse(await readFile(path.join(dir, "state.json"), "utf8"));
  assert.equal(raw.version, 1);
  assert.equal(raw.reviews.length, 3);

  const reopened = createStore(dir);
  assert.equal(reopened.getLatestReview("a")?.id, latest.id);
  assert.deepEqual(reopened.listReviews("a").map((r) => r.riskScore), [20, 10]);
  assert.equal(reopened.getLatestDecision("a")?.id, decision.id);
  assert.equal(reopened.getLetter(letter.id)?.status, "approved");
  assert.deepEqual(reopened.listAudit().map((e) => e.message), ["two", "one"]);
  assert.deepEqual(reopened.listAudit({ limit: 1 }).map((e) => e.message), ["two"]);
  assert.equal(reopened.getLatestReview("missing"), undefined);
  assert.equal(await reopened.updateLetter("missing", { status: "approved" }), undefined);
  assert.equal((await readdir(dir)).filter((f) => f.endsWith(".tmp")).length, 0, "no temp files left behind");
});

test("concurrent writes are serialized and the file is always valid JSON", async () => {
  const dir = await tempDir();
  const store = createStore(dir);
  const letters = await Promise.all(Array.from({ length: 25 }, (_, i) => store.createLetter(letterInput(`s${i}`))));
  await Promise.all(letters.map((l: Letter) => store.updateLetter(l.id, { en: { subject: `S-${l.submissionId}`, body: "x" } })));
  await store.flush();
  const reopened = createStore(dir);
  assert.equal(reopened.listLetters().length, 25);
  assert.ok(reopened.listLetters().every((l) => l.en.subject === `S-${l.submissionId}`));
});

test("corrupt state file is moved aside and the store starts empty", async (t) => {
  const dir = await tempDir();
  await writeFile(path.join(dir, "state.json"), "{ not json");
  const warn = t.mock.method(console, "warn", () => {});
  const store = createStore(dir);
  assert.equal(warn.mock.callCount(), 1);
  assert.deepEqual(store.listAudit(), []);
  const files = await readdir(dir);
  const aside = files.find((f) => /^state\.corrupt-.*\.json$/.test(f));
  assert.ok(aside, `expected a state.corrupt-*.json file in ${files.join(", ")}`);
  assert.equal(await readFile(path.join(dir, aside), "utf8"), "{ not json");

  await store.appendAudit({ type: "demo_reset", actor: "system", message: "fresh", createdAt: "t" });
  assert.equal(createStore(dir).listAudit()[0].message, "fresh");
});

test("wrong state shape is treated as corrupt", async (t) => {
  const dir = await tempDir();
  await writeFile(path.join(dir, "state.json"), JSON.stringify({ version: 2, reviews: [] }));
  t.mock.method(console, "warn", () => {});
  assert.deepEqual(createStore(dir).listReviews("a"), []);
  assert.ok((await readdir(dir)).some((f) => f.startsWith("state.corrupt-")));
});

test("reset clears everything and reports counts", async () => {
  const dir = await tempDir();
  const store = createStore(dir);
  await store.saveReview(makeReview("a"));
  await store.createLetter(letterInput("a"));
  await store.appendAudit({ type: "review_completed", submissionId: "a", actor: "system", message: "m", createdAt: "t" });
  const report = await store.reset({ keepUploads: true });
  assert.deepEqual(report, { keepUploads: true, cleared: { reviews: 1, decisions: 0, letters: 1, audit: 1 } });
  assert.equal(store.getLatestReview("a"), undefined);
  assert.deepEqual(createStore(dir).listLetters(), []);
});

test("memory store keeps review history bounded per submission", async () => {
  const store = createMemoryStore();
  for (let i = 0; i < 25; i++) await store.saveReview(makeReview("a", { riskScore: i }));
  await store.saveReview(makeReview("b"));
  assert.equal(store.listReviews("a").length, 20);
  assert.equal(store.getLatestReview("a")?.riskScore, 24);
  assert.equal(store.listReviews("b").length, 1);
});

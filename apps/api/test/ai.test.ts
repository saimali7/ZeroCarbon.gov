import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import {
  answerQuestion,
  cacheKey,
  cachePath,
  draftLetter,
  findObservations,
  findQuote,
  readCache,
  unknownNumbers,
  writeCache,
  writeNarrative,
} from "../src/ai/index.ts";
import type { OpenRouterClient } from "../src/ai/openrouter.ts";
import type { AiContext, AskInput, ObservationsInput } from "../src/types.ts";
import {
  EAST_IDENTITY,
  EAST_REVIEW,
  RULES,
  SOUTH_FINDINGS,
  SOUTH_IDENTITY,
  SOUTH_PKG,
  SOUTH_REVIEW,
  fakeClient,
  letterInput,
  narrativeInput,
} from "./fixtures/ai-fixtures.ts";

let dir = "";
before(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "zc-ai-"));
});
after(async () => {
  await rm(dir, { recursive: true, force: true });
});

const demo = (sub: string): AiContext => ({ mode: "demo", cacheDir: path.join(dir, sub) });
const live = (client: OpenRouterClient, sub: string, writeCache = false): AiContext => ({ mode: "live", client, cacheDir: path.join(dir, sub), writeCache });
const numbered = (body: string) => (body.match(/^\d+\. /gm) ?? []).length;
const ARABIC = /[\u0600-\u06FF]/;
const throwing = fakeClient(() => {
  throw new Error("network down");
});
const ask = (question: string, over: Partial<AskInput> = {}): AskInput => ({ identity: SOUTH_IDENTITY, question, review: SOUTH_REVIEW, pkg: SOUTH_PKG, rules: RULES, ...over });
const obsInput = (): ObservationsInput & { inputHash: string } => ({
  identity: SOUTH_IDENTITY,
  pkg: SOUTH_PKG,
  findings: SOUTH_FINDINGS,
  rules: RULES,
  inputHash: SOUTH_REVIEW.inputHash,
});

// ---------------------------------------------------------------------------
// Narrative
// ---------------------------------------------------------------------------

test("demo narrative comes from the template, then from the cache once written", async () => {
  const ctx = demo("narrative-demo");
  const input = narrativeInput(SOUTH_REVIEW, SOUTH_IDENTITY);
  const first = await writeNarrative(input, ctx);
  assert.equal(first.source, "template");
  assert.equal(first.headline, "Non-compliant: about 54,179 t CO2e (19.7%) appears unreported");
  assert.match(first.summary, /risk score of 88 out of 100/);
  assert.match(first.summary, /329,075 t CO2e \(12\.74 kg CO2e\/boe/);
  assert.match(first.summary, /Recommended next step: send a query requiring a corrected report within 30 days; also consider a site inspection\./);
  const sentences = first.summary.split(/(?<=\.)\s+(?=[A-Z])/);
  assert.ok(sentences.length >= 3 && sentences.length <= 5, first.summary);
  assert.deepEqual(Object.keys(first.explanations).sort(), SOUTH_FINDINGS.map((f) => f.id).sort());
  assert.match(first.explanations["F-03"], /8,680,437 vs 22,976,806 Sm3/);
  assert.match(first.explanations["F-03"], /\(EAD TGD, s\. 5 \(Operators\) and Step 3\(a\); Decree-Law 11\/2024, Art\. 6\(1\)\)/);
  assert.match(first.explanations["F-07"], /voluntary until 2027/);
  assert.match(first.explanations["F-04"], /local, site-specific emission factors/);
  assert.match(first.explanations["F-06"], /signals to investigate, not proof/);
  assert.doesNotMatch(JSON.stringify(first), /\u2014/);

  await writeCache(ctx, "narrative", input.inputHash, {
    headline: "Cached headline",
    summary: "Cached summary.",
    explanations: { "F-01": "Cached F-01.", "F-99": "Stale entry." },
    model: "snapshot/model",
  });
  const second = await writeNarrative(input, ctx);
  assert.equal(second.source, "cache");
  assert.equal(second.model, "snapshot/model");
  assert.equal(second.headline, "Cached headline");
  assert.equal(second.explanations["F-01"], "Cached F-01.");
  assert.equal(second.explanations["F-02"], first.explanations["F-02"]);
  assert.ok(!("F-99" in second.explanations));
});

test("compliant narrative for Eastern Dunes", async () => {
  const out = await writeNarrative(narrativeInput(EAST_REVIEW, EAST_IDENTITY), demo("narrative-east"));
  assert.equal(out.headline, "Compliant: 242,693 t CO2e reported, no material issues found");
  assert.match(out.summary, /10 of 10 checks passed and no breaches were found/);
  assert.match(out.summary, /within the peer range \(11\.9 to 16\.2\)/);
  assert.match(out.summary, /Recommended next step: approve the report\./);
  assert.match(out.explanations["F-02"], /needs no action/);
});

test("live narrative output is cleaned and cached", async () => {
  const input = narrativeInput(SOUTH_REVIEW, SOUTH_IDENTITY);
  const client = fakeClient(() => ({
    headline: "Headline: Non-compliant: about 54,179 t CO2e (19.7%) appears unreported\nsecond line",
    summary: "The facility is non-compliant.\nIt reported 274,896 t CO2e and 99,999 t of something else.",
    explanations: [
      { findingId: "F-01", text: "Methane sources are missing \u2014 ask for estimates." },
      { findingId: "F-99", text: "Invented finding." },
    ],
  }));
  const ctx = live(client, "narrative-live", true);
  const out = await writeNarrative(input, ctx);
  assert.equal(out.source, "llm");
  assert.equal(out.model, "fake/model");
  assert.equal(out.headline, "Non-compliant: about 54,179 t CO2e (19.7%) appears unreported");
  assert.equal(out.summary, "The facility is non-compliant. It reported 274,896 t CO2e and 99,999 t of something else.");
  assert.equal(out.explanations["F-01"], "Methane sources are missing - ask for estimates.");
  assert.ok(!("F-99" in out.explanations));
  assert.equal(out.explanations["F-02"], (await writeNarrative(input, demo("narrative-none"))).explanations["F-02"]);
  assert.match(client.calls[0].system, /never invent numbers|Never invent numbers/);
  assert.match(client.calls[0].user, /"id":"F-03"/);

  const saved = await readCache<{ model: string; explanations: Record<string, string> }>(ctx, "narrative", input.inputHash);
  assert.equal(saved?.model, "fake/model");
  const replay = await writeNarrative(input, { mode: "demo", cacheDir: ctx.cacheDir });
  assert.equal(replay.source, "cache");
  assert.equal(replay.explanations["F-01"], out.explanations["F-01"]);
});

// ---------------------------------------------------------------------------
// Letters
// ---------------------------------------------------------------------------

test("request_clarification letter: template, every breach listed, Arabic parity, then cache", async () => {
  const ctx = demo("letter-demo");
  const input = letterInput(SOUTH_REVIEW, SOUTH_IDENTITY, "request_clarification");
  const out = await draftLetter(input, ctx);
  assert.equal(out.generatedBy, "template");
  assert.equal(out.reference, "EAD/MRV/2026/AD-OG-0417/Q1");
  assert.ok(out.en.body.startsWith("DRAFT prepared with ZeroCarbon.gov for officer review"));
  assert.ok(out.ar.body.startsWith("مسودة معدة باستخدام ZeroCarbon.gov"));
  assert.match(out.ar.subject + out.ar.body, ARABIC);
  for (const c of [out.en, out.ar]) {
    assert.ok(c.subject.includes("AD-OG-0417") && c.body.includes("AD-OG-0417"));
    assert.ok(c.body.includes("EAD/MRV/2026/AD-OG-0417/Q1"));
  }
  const listed = SOUTH_FINDINGS.filter((f) => f.outcome === "breach" || f.outcome === "clarification");
  for (const f of listed) assert.ok(out.en.body.includes(f.title), `${f.id} missing from the letter`);
  assert.equal(numbered(out.en.body), listed.length + 2, "breaches + satellite signal + resubmission");
  assert.equal(numbered(out.ar.body), numbered(out.en.body));

  assert.match(out.en.subject, /^Notice requiring corrective action and clarification: Southern Dunes CPF-2 \(AD-OG-0417\), reporting year 2025$/);
  assert.match(out.en.body, /Attention: Hind Al Shamsi/);
  assert.match(
    out.en.body,
    /written notice under its powers to verify the accuracy of reported data \(Decree-Law 11\/2024, Arts\. 6\(1\)\(c\), 6\(3\) and 14; EAD TGD, Step 6\)\. It sets out each matter identified in the review, the corrective action required and the deadline/,
  );
  assert.equal((out.en.body.match(/Corrective action required: /g) ?? []).length, listed.length + 1);
  assert.match(out.en.body, /within 30 days of the date of this letter, that is by \d{1,2} [A-Z][a-z]+ \d{4}/);
  assert.match(out.en.body, /Legal basis: .*Decree-Law 11\/2024, Art\. 6\(1\)/);
  assert.match(out.en.body, /corrected within 30 days of discovery \(EAD TGD, Step 5\)/);
  assert.match(
    out.en.body,
    /If these matters are not remedied, the company may be exposed to .*AED 50,000 to AED 2,000,000, imposed by the courts \(Decree-Law 11\/2024, Art\. 15\), and the penalty is doubled if the same act is repeated within two years of a previous final conviction \(Decree-Law 11\/2024, Art\. 16\)/,
  );
  assert.match(out.en.body, /third-party verification remains voluntary until 2027/);
  assert.doesNotMatch(out.en.body, /verification is (mandatory|required|compulsory)|liable to/i);
  assert.match(out.en.body, /Relevant provisions: EAD TGD, Step 2\(b\), App\. 1\.2 and FAQ Q7/);
  assert.match(out.en.body, /DEC-SDF-CPF2_Production-and-Gas-Balance_Monthly_2025\.csv \(Column flared_by_balance_sm3/);
  assert.match(out.en.body, /about 54,179 t CO2e \(19\.7% of the reported 274,896 t CO2e\)/);
  assert.match(out.en.body, /The reported intensity of 10\.65 kg CO2e\/boe compares with a peer median of 13\.4/);
  assert.match(out.en.body, /Reviewing Officer\nClimate Change and Facility MRV\nEnvironment Agency - Abu Dhabi \(EAD\)$/);

  assert.match(out.ar.body, /السادة\/ شركة الكثبان للطاقة المحترمين/);
  assert.match(out.ar.body, /8,680,437 مقابل 22,976,806 Sm3/);
  assert.match(out.ar.body, /M-04 إلى M-08/);
  const arPoints = out.ar.body.split("\n").filter((line) => /^\d+\. /.test(line)).join("\n");
  assert.doesNotMatch(arPoints, /M-01 إلى M-03|\(CPF-2/, "identifiers come from the title, facility name excluded");
  assert.match(out.ar.body, /الورقة G_Methane، الصفوف M-04 إلى M-08/);
  assert.match(out.ar.body, /14 يوليو 2025/);
  assert.match(out.ar.body, /البند \(1\) من المادة \(6\) من المرسوم بقانون اتحادي رقم \(11\) لسنة 2024/);
  assert.match(out.ar.body, /لمواد 6\(1\)\(ج\) و6\(3\) و14 من المرسوم بقانون اتحادي رقم \(11\) لسنة 2024، والدليل الفني للهيئة، الخطوة 6/);
  assert.match(out.ar.body, /الإجراء التصحيحي المطلوب: /);
  assert.match(out.ar.body, /لا تقل عن 50,000 درهم ولا تزيد على 2,000,000 درهم تفرضها المحكمة المختصة/);
  assert.match(out.ar.body, /خلال سنتين من تاريخ صدور حكم نهائي سابق بالإدانة، وفقاً للمادة \(16\)/);
  assert.match(out.ar.body, /وفقاً للدليل الفني للهيئة، الخطوة 5/);
  assert.match(out.ar.body, /طوعياً حتى عام 2027/);
  assert.match(out.ar.body, /خلال 30 يوماً من تاريخ هذا الخطاب/);
  assert.doesNotMatch(out.en.body + out.ar.body, /[\u2014\u0660-\u0669]/);

  await writeCache(ctx, "letter", `${SOUTH_REVIEW.inputHash}-request_clarification`, { en: out.en, ar: out.ar, reference: out.reference, model: "snapshot/model" });
  const cached = await draftLetter(input, ctx);
  assert.equal(cached.generatedBy, "cache");
  assert.equal(cached.model, "snapshot/model");
  assert.equal(cached.en.body, out.en.body);
  assert.equal((await draftLetter(letterInput(SOUTH_REVIEW, SOUTH_IDENTITY, "refer_penalty"), ctx)).generatedBy, "template");
});

test("approve letter for the compliant Eastern Dunes case", async () => {
  const out = await draftLetter(letterInput(EAST_REVIEW, EAST_IDENTITY, "approve", "Mariam Al Kaabi"), demo("letter-east"));
  assert.equal(out.reference, "EAD/MRV/2026/AD-OG-0412/A1");
  assert.equal(out.en.subject, "Acceptance of annual emissions report: Eastern Dunes CPF-1 (AD-OG-0412), reporting year 2025");
  assert.match(out.en.body, /the report is accepted\. The reported emissions of 242,693 t CO2e \(225,851 t CO2 and 601\.5 t CH4\)/);
  assert.match(out.en.body, /within the range of comparable facilities \(11\.9 to 16\.2 kg CO2e\/boe\)/);
  assert.match(out.en.body, /No action is required\./);
  assert.doesNotMatch(out.en.body, /Attention:|AED/);
  assert.match(out.ar.body, /بقبول التقرير/);
  assert.match(out.ar.body, /242,693 طن CO2e/);
  assert.match(out.ar.body, /من 11 إلى 13 مارس 2025/);
  assert.equal(numbered(out.en.body), 2);
  assert.equal(numbered(out.ar.body), 2);
  assert.match(out.en.body, /Mariam Al Kaabi\nReviewing Officer/);
  assert.match(out.ar.body, /Mariam Al Kaabi\nالموظف المختص بالمراجعة/);
});

test("inspection and penalty letters keep both languages aligned", async () => {
  const ctx = demo("letter-other");
  const inspection = await draftLetter(letterInput(SOUTH_REVIEW, SOUTH_IDENTITY, "escalate_inspection"), ctx);
  assert.equal(inspection.reference, "EAD/MRV/2026/AD-OG-0417/I1");
  assert.match(inspection.en.body, /intends to carry out a site inspection .*\(Decree-Law 11\/2024, Arts\. 6\(1\)\(c\), 6\(3\) and 14; EAD TGD, Step 6\)/);
  assert.match(inspection.ar.body, /استناداً إلى المواد 6\(1\)\(ج\) و6\(3\) و14/);
  assert.match(inspection.en.body, /signals that require explanation, not as proof/);
  assert.match(inspection.en.body, /Please make the following available to the inspection team:/);
  assert.equal(numbered(inspection.ar.body), numbered(inspection.en.body));

  const penalty = await draftLetter(letterInput(SOUTH_REVIEW, SOUTH_IDENTITY, "refer_penalty"), ctx);
  assert.equal(penalty.reference, "EAD/MRV/2026/AD-OG-0417/P1");
  for (const f of SOUTH_FINDINGS.filter((x) => x.outcome === "breach")) assert.ok(penalty.en.body.includes(f.title), f.id);
  assert.equal(numbered(penalty.en.body), SOUTH_FINDINGS.filter((x) => x.outcome === "breach").length);
  assert.equal(numbered(penalty.ar.body), numbered(penalty.en.body));
  assert.match(penalty.en.body, /intends to refer these breaches for enforcement action/);
  assert.match(penalty.en.body, /AED 50,000 to AED 2,000,000, imposed by the courts .* within two years of a previous final conviction/);
  assert.match(penalty.en.body, /Legal basis: .*Decree-Law 11\/2024, Art\. 15; Decree-Law 11\/2024, Art\. 16/);
  assert.match(penalty.ar.body, /تعتزم الهيئة إحالة هذه المخالفات/);
  assert.match(penalty.ar.body, /2,000,000 درهم تفرضها المحكمة المختصة/);
});

test("live letters are validated and fall back to the template when invalid", async () => {
  const input = letterInput(SOUTH_REVIEW, SOUTH_IDENTITY, "request_clarification");
  const good = {
    en: { subject: "Request for clarification: Southern Dunes CPF-2 (AD-OG-0417)", body: "Dear Sir or Madam,\n\n1. Declare the FT-5101 data gap.\n\n2. Quantify M-04 to M-08." },
    ar: { subject: "طلب إيضاحات: AD-OG-0417", body: "تحية طيبة وبعد،\n\n١. الإفصاح عن فجوة البيانات في FT-5101.\n\n٢. تقدير انبعاثات M-04 إلى M-08 كمياً." },
  };
  const ok = await draftLetter(input, live(fakeClient(() => good), "letter-live", true));
  assert.equal(ok.generatedBy, "llm");
  assert.equal(ok.reference, "EAD/MRV/2026/AD-OG-0417/Q1");
  assert.ok(ok.en.body.startsWith("DRAFT prepared with ZeroCarbon.gov for officer review\n\n"));
  assert.ok(ok.ar.body.startsWith("مسودة معدة باستخدام ZeroCarbon.gov"));
  assert.match(ok.ar.body, /^1\. الإفصاح/m);
  assert.ok(await readCache(demo("letter-live"), "letter", `${SOUTH_REVIEW.inputHash}-request_clarification`));

  const noArabic = { ...good, ar: { subject: "Request AD-OG-0417", body: "1. One.\n\n2. Two." } };
  assert.equal((await draftLetter(input, live(fakeClient(() => noArabic), "letter-bad"))).generatedBy, "template");
  const mismatch = { ...good, ar: { ...good.ar, body: "تحية طيبة وبعد،\n\n1. نقطة واحدة فقط." } };
  assert.equal((await draftLetter(input, live(fakeClient(() => mismatch), "letter-bad"))).generatedBy, "template");
  const noId = { ...good, en: { subject: "Request for clarification", body: "1. One.\n\n2. Two." } };
  assert.equal((await draftLetter(input, live(fakeClient(() => noId), "letter-bad"))).generatedBy, "template");
});

test("a throwing client falls back to templates and offline answers", async () => {
  const narrative = await writeNarrative(narrativeInput(SOUTH_REVIEW, SOUTH_IDENTITY), live(throwing, "throw"));
  assert.equal(narrative.source, "template");
  assert.match(narrative.headline, /^Non-compliant/);
  const letter = await draftLetter(letterInput(SOUTH_REVIEW, SOUTH_IDENTITY, "request_clarification"), live(throwing, "throw"));
  assert.equal(letter.generatedBy, "template");
  const answer = await answerQuestion(ask("Why is the flare flagged?"), live(throwing, "throw"));
  assert.equal(answer.source, "offline");
  assert.deepEqual(await findObservations(obsInput(), live(throwing, "throw")), []);
});

// ---------------------------------------------------------------------------
// Q&A
// ---------------------------------------------------------------------------

test("offline Q&A explains why the flare is flagged with the gas balance finding and its evidence", async () => {
  const res = await answerQuestion(ask("Why is the flare flagged?"), demo("ask"));
  assert.equal(res.source, "offline");
  assert.match(res.answer, /Flare volumes contradict the company's own gas balance \(F-03, critical, breach\)/);
  assert.match(res.answer, /8,680,437 vs 22,976,806 Sm3/);
  assert.match(res.answer, /Evidence: DEC-SDF-CPF2_Production-and-Gas-Balance_Monthly_2025\.csv/);
  assert.ok(res.answer.indexOf("F-03") < res.answer.indexOf("F-02"), "gas balance finding comes first");
  assert.ok(res.citations.some((c) => c.documentId === "production-and-gas-balance-monthly-2025"));
  assert.ok(res.ruleIds.includes("EAD-TGD-COMPLETENESS"));
  assert.ok(res.ruleIds.every((id) => RULES.some((r) => r.id === id)));
});

test("offline Q&A covers penalties, peers and unmatched questions", async () => {
  const fine = await answerQuestion(ask("What fine could the operator face?"), demo("ask"));
  assert.match(fine.answer, /AED 50,000 to 2,000,000/);
  assert.match(fine.answer, /the officer decides/);
  assert.deepEqual(fine.ruleIds, ["DL11-2024-ART15", "DL11-2024-ART16"]);

  const peers = await answerQuestion(ask("How does the intensity compare with peers?"), demo("ask"));
  assert.match(peers.answer, /10\.65 kg CO2e\/boe compares with a peer median of 13\.4/);
  assert.match(peers.answer, /12\.74 kg CO2e\/boe/);

  const none = await answerQuestion(ask("What colour is the sky?"), demo("ask"));
  assert.match(none.answer, /Live AI is off/);
  assert.match(none.answer, /^1\. Methane sources M-04 to M-08 not quantified \(F-01\)/m);
  assert.ok(none.citations.length > 0);

  const east = await answerQuestion(ask("Is the methane reporting complete?", { identity: EAST_IDENTITY, review: EAST_REVIEW, pkg: undefined }), demo("ask"));
  assert.match(east.answer, /All 9 methane sources quantified/);

  const unreviewed = await answerQuestion(ask("Anything wrong?", { review: undefined }), demo("ask"));
  assert.match(unreviewed.answer, /not been reviewed yet.*274,896 t CO2e/);
});

test("live Q&A keeps only valid citations and rule ids", async () => {
  const client = fakeClient(() => ({
    answer: "The flare is flagged because June to December volumes are 62.2% below the gas balance.",
    citations: [
      { documentId: "production-and-gas-balance-monthly-2025", locator: "Column flared_by_balance_sm3", page: null, quote: null },
      { documentId: "invented-document", locator: "Page 9", page: 9, quote: null },
      { documentId: "monitoring-plan-rev3-0", locator: null, page: 7, quote: "Deviations greater than 10% are investigated and documented." },
      { documentId: "verification-statement-ry2025", locator: "Page 2", page: 2, quote: "The verifier approved everything without comment." },
    ],
    ruleIds: ["EAD-TGD-COMPLETENESS", "EAD-TGD-MADE-UP"],
  }));
  const res = await answerQuestion(ask("Why is the flare flagged?"), live(client, "ask-live"));
  assert.equal(res.source, "llm");
  assert.deepEqual(res.ruleIds, ["EAD-TGD-COMPLETENESS"]);
  assert.equal(res.citations.length, 3);
  assert.ok(!res.citations.some((c) => c.documentId === "invented-document"));
  const plan = res.citations.find((c) => c.documentId === "monitoring-plan-rev3-0");
  assert.equal(plan?.page, 4, "page corrected to where the quote was found");
  assert.equal(plan?.quote, "Deviations greater than 10% are investigated and documented.");
  const verification = res.citations.find((c) => c.documentId === "verification-statement-ry2025");
  assert.equal(verification?.page, 2);
  assert.equal(verification?.quote, undefined, "unverified quote removed");
  assert.match(client.calls[0].user, /Question: Why is the flare flagged\?/);
  assert.match(client.calls[0].user, /"excerpts":\[\{"documentId":"[a-z0-9-]+"/);
  assert.ok(client.calls[0].user.length < 45_000);
});

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------

test("observations: quotes verified against the PDFs, unverified and duplicate ones dropped", async () => {
  const client = fakeClient(() => ({
    observations: [
      {
        title: "LDAR programme not yet in place",
        explanation: "The Monitoring Plan says leak detection and repair is only planned for 2026.",
        evidence: [{ documentId: "monitoring-plan-rev3-0", page: 3, quote: "A leak detection and repair (LDAR)   programme is PLANNED for 2026." }],
        ruleIds: ["EAD-TGD-COMPLETENESS", "MADE-UP-RULE"],
      },
      {
        title: "Flare decommissioned",
        explanation: "Invented by the model.",
        evidence: [{ documentId: "monitoring-plan-rev3-0", page: 2, quote: "The HP flare was decommissioned in 2024." }],
        ruleIds: [],
      },
      {
        title: "Data gap notification to the Agency",
        explanation: "The plan requires gaps to be notified within 30 days; no notification is on file.",
        evidence: [
          { documentId: "monitoring-plan-rev3-0", page: 1, quote: "Gaps are recorded in sheet H1 of the emissions report and notified to the Agency within 30 days." },
          { documentId: "unknown-document", page: 1, quote: "Something that cannot be checked." },
        ],
        ruleIds: ["EAD-TGD-DATA-GAPS"],
      },
      {
        title: "Methane sources M-04 to M-08 not quantified",
        explanation: "Already a finding.",
        evidence: [{ documentId: "monitoring-plan-rev3-0", page: 3, quote: "A quantification methodology for these sources is under development" }],
        ruleIds: [],
      },
    ],
  }));
  const ctx = live(client, "observations", true);
  const out = await findObservations(obsInput(), ctx);
  assert.equal(out.length, 2);
  assert.deepEqual(
    out.map((o) => [o.id, o.title, o.quotesVerified]),
    [
      ["AI-01", "LDAR programme not yet in place", true],
      ["AI-02", "Data gap notification to the Agency", false],
    ],
  );
  assert.deepEqual(out[0].ruleIds, ["EAD-TGD-COMPLETENESS"]);
  assert.equal(out[0].evidence[0].page, 3);
  assert.equal(out[0].evidence[0].fileName, "DEC-SDF-CPF2_Monitoring-Plan_Rev3.0.pdf");
  assert.equal(out[1].evidence.length, 1);
  assert.equal(out[1].evidence[0].page, 4);

  assert.deepEqual(await findObservations(obsInput(), demo("observations-empty")), []);
  assert.deepEqual(await findObservations(obsInput(), { mode: "demo", cacheDir: ctx.cacheDir }), out);
  const { inputHash: _unused, ...withoutHash } = obsInput();
  assert.deepEqual(await findObservations(withoutHash, demo("observations-empty")), [], "derived cache key works without inputHash");
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

test("cache keys are safe file names", () => {
  assert.equal(cacheKey("south0417hash-request_clarification"), "south0417hash-request_clarification");
  assert.match(cacheKey("../../etc/passwd"), /^[0-9a-f]{32}$/);
  assert.match(cacheKey(".hidden"), /^[0-9a-f]{32}$/);
  const file = cachePath({ cacheDir: "/cache" }, "letter", "a/b");
  assert.equal(path.dirname(file), path.join("/cache", "letter"));
});

test("numbers guard and quote matching", () => {
  assert.deepEqual(unknownNumbers("about 54,179 t, 12,345 t, 0417 and 2026", '{"a":54179.2,"id":"AD-OG-0417","y":2025}'), ["12,345", "2026"]);
  const pages = SOUTH_PKG.pdfText["verification-statement-ry2025"];
  assert.deepEqual(findQuote(pages, "QUALIFIED opinion.  Based on the procedures performed"), { page: 2 });
  assert.deepEqual(findQuote(pages, "the calibration of HP flare meter FT-5101 ... not reinstated during the reporting period"), { page: 2 });
  assert.equal(findQuote(pages, "Unmodified opinion without qualification"), undefined);
  assert.equal(findQuote(pages, "opinion"), undefined, "too short to verify");
});

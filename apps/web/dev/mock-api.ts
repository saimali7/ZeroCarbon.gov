/**
 * Dev-only mock of the ZeroCarbon API (see dev/README.md). Serves the routes in packages/shared/src/routes.ts
 * from in-memory state and the typed fixtures in dev/fixtures, using the real files in demo/.
 * Run from apps/web: node --import tsx dev/mock-api.ts
 */
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type {
  AskResponse,
  AuditEvent,
  AuditEventType,
  DashboardResponse,
  Decision,
  DecisionAction,
  DecisionResponse,
  DocumentTextResponse,
  EmissionsReport,
  EvidenceData,
  EvidenceRef,
  HealthResponse,
  Letter,
  LetterContent,
  Review,
  ReviewAllResponse,
  ReviewStatus,
  SubmissionDetail,
  SubmissionSource,
  SubmissionStage,
  SubmissionSummary,
} from "@zerocarbon/shared";
import { apiRoutes, uploadFields } from "@zerocarbon/shared/routes";
import { askTopic, buildLetter, FACILITIES, REGULATIONS, type FacilityFixture } from "./fixtures";
import { describeFiles, findRepoRoot, loadReference, parseEvidence, pdfPages, readPackageFolder, renderReportText, type LoadedDoc, type PageText } from "./lib";

const PORT = Number(process.env.MOCK_API_PORT) || 4100;
const HOST = "127.0.0.1";
const ROOT = findRepoRoot(typeof __dirname === "string" ? __dirname : process.cwd());
const ACTIONS: DecisionAction[] = ["approve", "request_clarification", "escalate_inspection", "refer_penalty"];

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

interface Pkg {
  id: string;
  source: SubmissionSource;
  fixture: FacilityFixture;
  docs: LoadedDoc[];
  report: EmissionsReport;
  evidence: EvidenceData;
  receivedAt: string;
}

type Headers = Record<string, string>;
type Reply = { status: number; json: unknown } | { status: number; headers: Headers; file: string } | { status: number; headers: Headers; body: Buffer };
type Handler = (req: IncomingMessage, params: string[], url: URL) => Promise<Reply> | Reply;

const state = {
  generation: 0,
  demo: [] as Pkg[],
  uploads: [] as Pkg[],
  reviews: [] as Review[],
  decisions: [] as Decision[],
  letters: [] as Letter[],
  audit: [] as AuditEvent[],
  reviewing: new Map<string, Promise<Review>>(),
  uploadSeq: 0,
};
let reference: Awaited<ReturnType<typeof loadReference>>;

const now = () => new Date().toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = (json: unknown, status = 200): Reply => ({ status, json });
const packages = () => [...state.demo, ...state.uploads];
const latestReview = (id: string) => state.reviews.findLast((r) => r.submissionId === id);
const latestDecision = (id: string) => state.decisions.findLast((d) => d.submissionId === id);
const newestFirst = <T extends { submissionId?: string }>(items: T[], id?: string) => items.filter((x) => !id || x.submissionId === id).reverse();

function getPkg(id: string): Pkg {
  const pkg = packages().find((p) => p.id === id);
  if (!pkg) throw new HttpError(404, `Submission ${id} not found`);
  return pkg;
}

function audit(type: AuditEventType, submissionId: string | undefined, actor: string, message: string, createdAt = now()) {
  state.audit.push({ id: randomUUID(), type, ...(submissionId ? { submissionId } : {}), actor, message, createdAt });
}

function stageOf(id: string): SubmissionStage {
  if (state.reviewing.has(id)) return "reviewing";
  if (latestDecision(id)) return "decided";
  return latestReview(id) ? "reviewed" : "not_reviewed";
}

function summary(pkg: Pkg): SubmissionSummary {
  const { report: r, fixture: f } = pkg;
  const review = latestReview(pkg.id);
  return {
    id: pkg.id, source: pkg.source, facilityName: r.facility.name, facilityShortName: f.shortName, operator: r.operator.name, eadId: r.facility.eadId,
    emirate: r.facility.emirate, sector: r.facility.sector, reportingYear: r.reportingYear, submittedOn: r.submittedOn, reportedTotalTco2e: r.totals.totalCo2eT,
    documentCount: pkg.docs.length, lat: r.facility.lat, lon: r.facility.lon, stage: stageOf(pkg.id), status: review?.status, riskScore: review?.riskScore,
    riskBand: review?.riskBand, findingCount: review?.findings.length, estimatedUnderReportingTco2e: review?.metrics.estimatedUnderReportingTco2e,
    decision: latestDecision(pkg.id)?.action, reviewedAt: review?.createdAt,
  };
}

function detail(pkg: Pkg): SubmissionDetail {
  return {
    ...summary(pkg), documents: pkg.docs.map((d) => d.meta), report: pkg.report, evidence: pkg.evidence, review: latestReview(pkg.id),
    decisions: newestFirst(state.decisions, pkg.id), letters: newestFirst(state.letters, pkg.id),
  };
}

const inputHash = (pkg: Pkg) => createHash("sha256").update(pkg.docs.map((d) => d.meta.sha256).sort().join("\n")).digest("hex");

function runReview(pkg: Pkg): Promise<Review> {
  const inflight = state.reviewing.get(pkg.id);
  if (inflight) return inflight;
  const generation = state.generation;
  const p = (async () => {
    const started = Date.now();
    audit("review_started", pkg.id, "system", `Review started for ${pkg.fixture.shortName} (${pkg.docs.length} documents)`);
    await sleep(900 + Math.random() * 900);
    if (generation !== state.generation) throw new HttpError(409, "Demo was reset while the review was running");
    const durationMs = Date.now() - started;
    const f = structuredClone(pkg.fixture.review);
    const scale = durationMs / f.stages.reduce((s, x) => s + x.durationMs, 0);
    const review: Review = {
      ...f, id: randomUUID(), submissionId: pkg.id, createdAt: now(), durationMs, inputHash: inputHash(pkg),
      stages: f.stages.map((s) => ({ ...s, durationMs: Math.max(1, Math.round(s.durationMs * scale)) })),
    };
    state.reviews.push(review);
    audit("review_completed", pkg.id, "system", `Review completed: ${review.status}, risk ${review.riskScore}/100, ${review.findings.length} findings (${durationMs} ms)`);
    return review;
  })().finally(() => {
    if (state.reviewing.get(pkg.id) === p) state.reviewing.delete(pkg.id);
  });
  state.reviewing.set(pkg.id, p);
  return p;
}

function draftLetter(pkg: Pkg, review: Review, action: DecisionAction, actor: string): Letter {
  const seq = state.letters.filter((l) => l.submissionId === pkg.id).length + 1;
  const reference = `EAD/MRV/${new Date().getFullYear()}/${pkg.report.facility.eadId}/${String(seq).padStart(2, "0")}`;
  const t = now();
  const { en, ar } = buildLetter({ fixture: pkg.fixture, review, action, reference, date: t });
  const letter: Letter = { id: randomUUID(), submissionId: pkg.id, reviewId: review.id, action, en, ar, reference, generatedBy: "template", status: "draft", createdAt: t, updatedAt: t };
  state.letters.push(letter);
  audit("letter_drafted", pkg.id, actor, `Letter ${reference} drafted (${action})`);
  return letter;
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const b = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += b.length;
    if (size > limit) throw new HttpError(413, "Request body too large");
    chunks.push(b);
  }
  return Buffer.concat(chunks);
}

async function jsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const buf = await readBody(req, 1_000_000);
  let value: unknown;
  try {
    value = JSON.parse(buf.toString("utf8"));
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Request body must be a JSON object");
  return value as Record<string, unknown>;
}

function optString(body: Record<string, unknown>, key: string): string | undefined {
  const v = body[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new HttpError(400, `${key} must be a string`);
  return v;
}

function action(body: Record<string, unknown>): DecisionAction {
  const v = body.action;
  if (typeof v !== "string" || !(ACTIONS as string[]).includes(v)) throw new HttpError(400, `action must be one of ${ACTIONS.join(", ")}`);
  return v as DecisionAction;
}

function letterContent(v: unknown, key: string): LetterContent | undefined {
  if (v === undefined) return undefined;
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  if (typeof o.subject !== "string" || typeof o.body !== "string") throw new HttpError(400, `${key} must be { subject: string, body: string }`);
  return { subject: o.subject, body: o.body };
}

function requireReview(pkg: Pkg): Review {
  const review = latestReview(pkg.id);
  if (!review) throw new HttpError(409, `Submission ${pkg.id} has not been reviewed yet; run POST ${apiRoutes.review(pkg.id)} first`);
  return review;
}

function findDoc(pkg: Pkg, documentId: string): LoadedDoc {
  const doc = pkg.docs.find((d) => d.meta.id === documentId);
  if (!doc) throw new HttpError(404, `Document ${documentId} not found in submission ${pkg.id}`);
  return doc;
}

const fileHeaders = (fileName: string, mediaType: string, size?: number): Headers => ({
  "content-type": mediaType.startsWith("text/") ? `${mediaType}; charset=utf-8` : mediaType,
  "content-disposition": `inline; filename="${fileName.replace(/"/g, "")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  ...(size === undefined ? {} : { "content-length": String(size) }),
});

async function docPages(pkg: Pkg, doc: LoadedDoc): Promise<PageText[]> {
  if (doc.meta.mediaType === "application/pdf") return (doc.pages ??= await pdfPages(doc.data).catch(() => []));
  if (doc.meta.kind === "emissions_report" && /\.xls[xm]$/i.test(doc.meta.fileName)) return [{ page: 1, text: renderReportText(pkg.report) }];
  if (doc.meta.mediaType.startsWith("text/") || /\.(csv|txt|json|geojson)$/i.test(doc.meta.fileName)) return [{ page: 1, text: doc.data.toString("utf8") }];
  return [];
}

function matchFixture(entries: { relativePath: string; data: Buffer }[], xlsx: { relativePath: string; data: Buffer }): FacilityFixture | undefined {
  const base = (p: string) => path.posix.basename(p);
  const sha = createHash("sha256").update(xlsx.data).digest("hex");
  return (
    FACILITIES.find((f) => base(xlsx.relativePath).startsWith(f.code)) ??
    state.demo.find((p) => p.docs.some((d) => d.meta.sha256 === sha))?.fixture ??
    FACILITIES.find((f) => entries.some((e) => base(e.relativePath).startsWith(f.code) || e.relativePath.includes(f.folder)))
  );
}

const routes: [string, string, Handler][] = [
  ["GET", apiRoutes.health(), () =>
    ok({ ok: true, service: "zerocarbon-api", version: "0.1.0-mock", aiMode: "demo", submissionCount: packages().length, time: now() } satisfies HealthResponse)],

  ["GET", apiRoutes.dashboard(), () => {
    const subs = packages().map(summary);
    const latest = packages().map((p) => latestReview(p.id)).filter((r): r is Review => !!r);
    const byStatus: Record<ReviewStatus, number> = { compliant: 0, needs_clarification: 0, non_compliant: 0 };
    const byStage: Record<SubmissionStage, number> = { not_reviewed: 0, reviewing: 0, reviewed: 0, decided: 0, failed: 0 };
    const decisions: Record<DecisionAction, number> = { approve: 0, request_clarification: 0, escalate_inspection: 0, refer_penalty: 0 };
    latest.forEach((r) => byStatus[r.status]++);
    subs.forEach((s) => (byStage[s.stage]++, s.decision && decisions[s.decision]++));
    const body: DashboardResponse = {
      reportingYear: Math.max(...packages().map((p) => p.report.reportingYear)), submissions: subs.length, reviewed: latest.length, byStatus, byStage,
      totalReportedTco2e: packages().reduce((s, p) => s + p.report.totals.totalCo2eT, 0),
      estimatedUnderReportingTco2e: latest.reduce((s, r) => s + r.metrics.estimatedUnderReportingTco2e, 0),
      averageReviewMs: latest.length ? Math.round(latest.reduce((s, r) => s + r.durationMs, 0) / latest.length) : undefined,
      decisions, topRisks: subs.filter((s) => s.riskScore !== undefined).sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0)).slice(0, 5), aiMode: "demo",
    };
    return ok(body);
  }],

  ["GET", apiRoutes.submissions(), () =>
    ok(packages().map(summary).sort((a, b) => (b.riskScore ?? -1) - (a.riskScore ?? -1) || (b.submittedOn ?? "").localeCompare(a.submittedOn ?? "")))],

  ["POST", apiRoutes.submissions(), async (req) => {
    const type = req.headers["content-type"] ?? "";
    if (!/^multipart\/form-data/i.test(type)) throw new HttpError(400, `Expected multipart/form-data with repeated "${uploadFields.files}" parts`);
    const buf = await readBody(req, 200 * 1024 * 1024);
    let form: FormData;
    try {
      form = await new Request("http://mock.local/upload", { method: "POST", headers: { "content-type": type }, body: new Uint8Array(buf) }).formData();
    } catch {
      throw new HttpError(400, "Malformed multipart body");
    }
    const files = form.getAll(uploadFields.files).filter((v): v is File => typeof v !== "string");
    const rel = form.getAll(uploadFields.relativePaths).map(String);
    if (!files.length) throw new HttpError(400, `No files uploaded (expected repeated "${uploadFields.files}" parts)`);
    let entries = await Promise.all(
      files.map(async (f, i) => ({ relativePath: (rel[i] || f.name).replace(/\\/g, "/").replace(/^\.?\/+/, ""), data: Buffer.from(await f.arrayBuffer()), mediaType: f.type })),
    );
    entries = entries.filter((e) => e.relativePath && !path.posix.basename(e.relativePath).startsWith("."));
    const tops = new Set(entries.map((e) => e.relativePath.split("/")[0]));
    if (tops.size === 1 && entries.every((e) => e.relativePath.includes("/"))) entries = entries.map((e) => ({ ...e, relativePath: e.relativePath.split("/").slice(1).join("/") }));
    const xlsx = entries.find((e) => /\.xls[xm]$/i.test(e.relativePath));
    if (!xlsx) throw new HttpError(400, "No EAD MRV workbook (.xlsx) found in the upload");
    const fixture = matchFixture(entries, xlsx);
    if (!fixture) throw new HttpError(400, "Workbook not recognised: this mock only knows the two demo facilities (Eastern Dunes CPF-1, Southern Dunes CPF-2)");
    const docs = await describeFiles(entries);
    const workbook = docs.find((d) => d.meta.relativePath === xlsx.relativePath) ?? docs[0];
    const id = `upload-${++state.uploadSeq}-${fixture.report.facility.eadId.toLowerCase()}`;
    const pkg: Pkg = { id, source: "upload", fixture, docs, report: { ...structuredClone(fixture.report), documentId: workbook.meta.id }, evidence: parseEvidence(docs), receivedAt: now() };
    state.uploads.push(pkg);
    audit("submission_received", id, fixture.report.operator.name, `Upload received: ${docs.length} files for ${fixture.shortName} (${fixture.report.facility.eadId})`);
    return ok(summary(pkg), 201);
  }],

  ["GET", apiRoutes.submission("__id__"), (_req, [id]) => ok(detail(getPkg(id)))],

  ["POST", apiRoutes.review("__id__"), async (_req, [id]) => ok(await runReview(getPkg(id)))],

  ["POST", apiRoutes.reviewAll(), async () => {
    const started = Date.now();
    const results: ReviewAllResponse["results"] = [];
    for (const pkg of packages()) {
      const t = Date.now();
      try {
        const r = await runReview(pkg);
        results.push({ submissionId: pkg.id, status: r.status, riskScore: r.riskScore, durationMs: Date.now() - t });
      } catch (err) {
        results.push({ submissionId: pkg.id, durationMs: Date.now() - t, error: err instanceof Error ? err.message : String(err) });
      }
    }
    const failed = results.filter((r) => r.error).length;
    return ok({ reviewed: results.length - failed, failed, durationMs: Date.now() - started, results } satisfies ReviewAllResponse);
  }],

  ["GET", apiRoutes.document("__id__", "__doc__"), (_req, [id, documentId]) => {
    const pkg = getPkg(id);
    const ref = reference.files[documentId];
    if (ref) return { status: 200, headers: fileHeaders(ref.fileName, ref.mediaType, ref.size), file: ref.absPath };
    const doc = findDoc(pkg, documentId);
    const headers = fileHeaders(doc.meta.fileName, doc.meta.mediaType, doc.meta.sizeBytes);
    return doc.absPath ? { status: 200, headers, file: doc.absPath } : { status: 200, headers, body: doc.data };
  }],

  ["GET", apiRoutes.documentText("__id__", "__doc__"), async (_req, [id, documentId]) => {
    const pkg = getPkg(id);
    const ref = reference.files[documentId];
    if (ref) return ok({ documentId, fileName: ref.fileName, kind: "other", pages: [{ page: 1, text: await readFile(ref.absPath, "utf8") }] } satisfies DocumentTextResponse);
    const doc = findDoc(pkg, documentId);
    return ok({ documentId: doc.meta.id, fileName: doc.meta.fileName, kind: doc.meta.kind, pages: await docPages(pkg, doc) } satisfies DocumentTextResponse);
  }],

  ["POST", apiRoutes.ask("__id__"), async (req, [id]) => {
    const pkg = getPkg(id);
    const question = (await jsonBody(req)).question;
    if (typeof question !== "string" || !question.trim()) throw new HttpError(400, "question must be a non-empty string");
    await sleep(700);
    return ok({ ...structuredClone(pkg.fixture.ask[askTopic(question)]), source: "offline" } satisfies AskResponse);
  }],

  ["POST", apiRoutes.decisions("__id__"), async (req, [id]) => {
    const pkg = getPkg(id);
    const body = await jsonBody(req);
    const act = action(body);
    const officerName = optString(body, "officerName")?.trim();
    if (!officerName) throw new HttpError(400, "officerName must be a non-empty string");
    const note = optString(body, "note")?.trim() || undefined;
    if (body.draftLetter !== undefined && typeof body.draftLetter !== "boolean") throw new HttpError(400, "draftLetter must be a boolean");
    const review = requireReview(pkg);
    const decision: Decision = { id: randomUUID(), submissionId: pkg.id, reviewId: review.id, action: act, officerName, ...(note ? { note } : {}), createdAt: now() };
    audit("decision_recorded", pkg.id, officerName, `Decision recorded: ${act}${note ? `. Note: ${note}` : ""}`);
    const letter = body.draftLetter === false ? undefined : draftLetter(pkg, review, act, officerName);
    if (letter) decision.letterId = letter.id;
    state.decisions.push(decision);
    return ok({ decision, ...(letter ? { letter } : {}) } satisfies DecisionResponse, 201);
  }],

  ["POST", apiRoutes.letters("__id__"), async (req, [id]) => {
    const pkg = getPkg(id);
    const act = action(await jsonBody(req));
    return ok(draftLetter(pkg, requireReview(pkg), act, "system"), 201);
  }],

  ["PATCH", apiRoutes.letter("__letter__"), async (req, [letterId]) => {
    const letter = state.letters.find((l) => l.id === letterId);
    if (!letter) throw new HttpError(404, `Letter ${letterId} not found`);
    const body = await jsonBody(req);
    const en = letterContent(body.en, "en");
    const ar = letterContent(body.ar, "ar");
    const status = body.status;
    if (status !== undefined && status !== "draft" && status !== "approved") throw new HttpError(400, 'status must be "draft" or "approved"');
    const officer = optString(body, "officerName")?.trim() || undefined;
    if (!en && !ar && status === undefined) throw new HttpError(400, "Nothing to update: send en, ar and/or status");
    const actor = officer ?? "officer";
    if (en) letter.en = en;
    if (ar) letter.ar = ar;
    letter.updatedAt = now();
    if (en || ar) audit("letter_updated", letter.submissionId, actor, `Letter ${letter.reference} edited (${[en && "English", ar && "Arabic"].filter(Boolean).join(" and ")})`);
    if (status === "approved" && letter.status !== "approved") {
      Object.assign(letter, { status, approvedBy: officer ?? "Officer", approvedAt: letter.updatedAt });
      audit("letter_approved", letter.submissionId, actor, `Letter ${letter.reference} approved`);
    } else if (status === "draft" && letter.status !== "draft") {
      letter.status = "draft";
      delete letter.approvedBy;
      delete letter.approvedAt;
      audit("letter_updated", letter.submissionId, actor, `Letter ${letter.reference} returned to draft`);
    }
    return ok(letter);
  }],

  ["GET", apiRoutes.reference(), () => ok(reference.data)],

  ["GET", apiRoutes.regulations(), () => ok(REGULATIONS)],

  ["GET", apiRoutes.audit(), (_req, _params, url) => {
    const id = url.searchParams.get("submissionId") ?? undefined;
    return ok(newestFirst(state.audit, id));
  }],

  ["POST", apiRoutes.demoReset(), () => {
    Object.assign(state, { generation: state.generation + 1, uploads: [], reviews: [], decisions: [], letters: [], audit: [], uploadSeq: 0 });
    state.reviewing.clear();
    seedAudit();
    audit("demo_reset", undefined, "system", "Demo reset: reviews, decisions, letters and uploads cleared");
    return ok({ ok: true });
  }],
];

const compiled = routes.map(([method, pattern, handler]) => ({
  method,
  handler,
  re: new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/__(id|doc|letter)__/g, "([^/]+)")}$`),
}));

async function dispatch(req: IncomingMessage, url: URL): Promise<Reply> {
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  let pathMatched = false;
  for (const r of compiled) {
    const m = r.re.exec(pathname);
    if (!m) continue;
    pathMatched = true;
    if (r.method !== req.method) continue;
    let params: string[];
    try {
      params = m.slice(1).map(decodeURIComponent);
    } catch {
      throw new HttpError(400, "Malformed URL encoding");
    }
    return r.handler(req, params, url);
  }
  throw pathMatched ? new HttpError(405, `Method ${req.method} not allowed on ${pathname}`) : new HttpError(404, `No route for ${req.method} ${pathname}`);
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const started = Date.now();
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  let status = 500;
  try {
    const reply = await dispatch(req, url);
    status = reply.status;
    if ("json" in reply) {
      const body = JSON.stringify(reply.json);
      res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body), "cache-control": "no-store" });
      res.end(body);
    } else if ("file" in reply) {
      res.writeHead(status, reply.headers);
      await pipeline(createReadStream(reply.file), res);
    } else {
      res.writeHead(status, reply.headers);
      res.end(reply.body);
    }
  } catch (err) {
    status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    if (res.headersSent) res.destroy();
    else {
      const body = JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
      res.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body) });
      res.end(body);
    }
  } finally {
    console.log(`${new Date().toISOString()} ${req.method} ${url.pathname}${url.search} ${status} ${Date.now() - started}ms`);
  }
}

function seedAudit() {
  for (const p of state.demo)
    audit("submission_received", p.id, p.report.operator.name, `Submission received via the EAD MRV portal: ${p.fixture.shortName} (${p.report.facility.eadId}), ${p.docs.length} documents`, p.receivedAt);
}

/** Startup self-check: every fixture EvidenceRef points at a real document, and every quote is verbatim in it. */
async function checkFixtures(pkg: Pkg): Promise<{ refs: number; problems: string[] }> {
  const refs: EvidenceRef[] = [];
  const ruleIds = new Set<string>();
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.documentId === "string" && typeof o.locator === "string") refs.push(o as unknown as EvidenceRef);
      if (Array.isArray(o.ruleIds)) o.ruleIds.forEach((id) => ruleIds.add(String(id)));
      Object.values(o).forEach(walk);
    }
  };
  walk([pkg.report, pkg.fixture.review, pkg.fixture.ask]);
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const known = new Set<string>(REGULATIONS.map((r) => r.id));
  const problems: string[] = [...ruleIds].filter((id) => !known.has(id)).map((id) => `unknown rule id ${id}`);
  for (const r of refs) {
    const ref = reference.files[r.documentId];
    const doc = pkg.docs.find((d) => d.meta.id === r.documentId);
    if (!ref && !doc) {
      problems.push(`${r.documentId}: unknown document`);
      continue;
    }
    if (!r.quote) continue;
    const pages = ref ? [{ page: 1, text: await readFile(ref.absPath, "utf8") }] : await docPages(pkg, doc as LoadedDoc);
    const text = norm(pages.filter((p) => !r.page || p.page === r.page).map((p) => p.text).join("\n"));
    if (!text.includes(norm(r.quote))) problems.push(`${r.documentId}${r.page ? ` p${r.page}` : ""}: quote not found: "${r.quote.slice(0, 60)}"`);
  }
  return { refs: refs.length, problems };
}

async function main() {
  const t = Date.now();
  reference = await loadReference(path.join(ROOT, "demo", "regulator-reference-SIMULATED"));
  state.demo = await Promise.all(
    FACILITIES.map(async (f): Promise<Pkg> => {
      const docs = await describeFiles(await readPackageFolder(path.join(ROOT, "demo", "submissions", f.folder)));
      const receivedAt = new Date(`${f.report.submittedOn}T09:00:00+04:00`).toISOString();
      return { id: f.submissionId, source: "demo", fixture: f, docs, report: f.report, evidence: parseEvidence(docs), receivedAt };
    }),
  );
  seedAudit();
  for (const pkg of state.demo) {
    const { refs, problems } = await checkFixtures(pkg);
    console.log(`[mock-api] ${pkg.id}: ${pkg.docs.length} documents, ${refs} evidence refs, ${problems.length} problems`);
    problems.forEach((p) => console.warn(`[mock-api]   ${p}`));
  }
  createServer((req, res) => void handle(req, res)).listen(PORT, HOST, () =>
    console.log(`[mock-api] listening on http://${HOST}:${PORT} (loaded in ${Date.now() - t} ms). Run the web app with BACKEND_URL=http://${HOST}:${PORT}`),
  );
}

main().catch((err) => {
  console.error("[mock-api] failed to start:", err);
  process.exit(1);
});

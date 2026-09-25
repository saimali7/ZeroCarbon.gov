import { createHash, randomUUID } from "node:crypto";
import type { AiObservation, DocumentFacts, PipelineStage, RegulationRule, Review } from "@zerocarbon/shared";
import { HttpError } from "../lib/http.ts";
import type {
  AiContext,
  ChecksResult,
  NarrativeInput,
  NarrativeOutput,
  ObservationsInput,
  PeerSubmission,
  ReviewInput,
  ReviewPipeline,
  ScoreResult,
  SubmissionCatalog,
  SubmissionIdentity,
  SubmissionPackage,
  SubmissionRecord,
} from "../types.ts";

/** Bump when checks or scoring change, so cached AI output keyed by input hash is not reused. */
export const PIPELINE_VERSION = "1";

export interface PipelineDeps {
  catalog: SubmissionCatalog;
  ai: AiContext;
  rules: () => RegulationRule[];
  extractFacts: (pkg: SubmissionPackage, ctx: AiContext) => Promise<DocumentFacts>;
  runChecks: (input: ReviewInput) => ChecksResult;
  scoreReview: (input: ReviewInput, result: ChecksResult) => ScoreResult;
  writeNarrative: (input: NarrativeInput, ctx: AiContext) => Promise<NarrativeOutput>;
  findObservations?: (input: ObservationsInput, ctx: AiContext) => Promise<AiObservation[]>;
  now?: () => Date;
}

export function buildIdentity(record: SubmissionRecord, pkg?: SubmissionPackage): SubmissionIdentity {
  const report = pkg?.report;
  return {
    submissionId: record.id,
    facilityName: report?.facility.name ?? record.facilityName,
    facilityShortName: record.facilityShortName,
    operator: report?.operator.name ?? record.operator,
    operatorAr: report?.operator.nameAr,
    eadId: record.eadId,
    permit: report?.facility.permit,
    reportingYear: record.reportingYear,
    submittedOn: record.submittedOn,
    contactName: report?.contacts?.ghgLead,
  };
}

function stableHash(value: unknown): string {
  const json = JSON.stringify(value, (_key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)))
      : v,
  );
  return createHash("sha256").update(json).digest("hex").slice(0, 24);
}

async function timed<T>(stages: PipelineStage[], name: PipelineStage["name"], fn: () => Promise<T> | T, detail?: (value: T) => string) {
  const started = performance.now();
  try {
    const value = await fn();
    stages.push({ name, status: "done", durationMs: Math.round(performance.now() - started), detail: detail?.(value) });
    return value;
  } catch (err) {
    stages.push({ name, status: "failed", durationMs: Math.round(performance.now() - started), detail: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

export function createPipeline(deps: PipelineDeps): ReviewPipeline {
  const now = deps.now ?? (() => new Date());

  async function loadPeers(record: SubmissionRecord): Promise<PeerSubmission[]> {
    const others = (await deps.catalog.list()).filter((r) => r.id !== record.id && r.reportingYear === record.reportingYear);
    const peers = await Promise.all(
      others.map(async (other) => {
        const pkg = await deps.catalog.loadPackage(other.id).catch(() => undefined);
        return pkg?.report ? { submissionId: other.id, report: pkg.report } : undefined;
      }),
    );
    return peers.filter((p): p is PeerSubmission => Boolean(p));
  }

  return {
    async run(submissionId) {
      const started = performance.now();
      const stages: PipelineStage[] = [];
      const record = await deps.catalog.get(submissionId);
      if (!record) throw new HttpError(404, `Submission ${submissionId} not found`);

      const pkg = await timed(stages, "ingest", () => deps.catalog.loadPackage(submissionId), (p) => `${p.documents.length} documents`);
      const report = pkg.report;
      if (!report) throw new HttpError(422, "No EAD emissions report workbook could be parsed in this submission");

      const [facts, reference, peerSubmissions] = await Promise.all([
        timed(stages, "extract", () => deps.extractFacts(pkg, deps.ai), (f) => `facts extracted by ${f.extractedBy}${f.model ? ` (${f.model})` : ""}`),
        deps.catalog.getReference(),
        loadPeers(record),
      ]);

      const input: ReviewInput = {
        submissionId,
        documents: pkg.documents,
        report,
        evidence: pkg.evidence,
        facts,
        reference,
        peerSubmissions,
      };
      const checks = await timed(stages, "checks", () => deps.runChecks(input), (r) => `${r.checks.length} checks, ${r.findings.length} findings`);
      const score = await timed(stages, "score", () => deps.scoreReview(input, checks), (s) => `${s.status}, risk ${s.riskScore}`);

      const inputHash = stableHash({
        version: PIPELINE_VERSION,
        eadId: report.facility.eadId,
        year: report.reportingYear,
        findings: checks.findings.map(({ explanation: _e, ...f }) => f),
        metrics: score.metrics,
        status: score.status,
        riskScore: score.riskScore,
        recommendedAction: score.recommendedAction,
      });
      const rules = deps.rules();
      const identity = buildIdentity(record, pkg);

      const [narrative, aiObservations] = await Promise.all([
        timed(
          stages,
          "narrative",
          () =>
            deps.writeNarrative(
              {
                identity,
                findings: checks.findings,
                checks: checks.checks,
                metrics: score.metrics,
                status: score.status,
                riskScore: score.riskScore,
                recommendedAction: score.recommendedAction,
                rules,
                inputHash,
              },
              deps.ai,
            ),
          (n) => `narrative from ${n.source}${n.model ? ` (${n.model})` : ""}`,
        ),
        deps.findObservations
          ? deps.findObservations({ identity, pkg, findings: checks.findings, rules, inputHash }, deps.ai).catch(() => [] as AiObservation[])
          : Promise.resolve([] as AiObservation[]),
      ]);

      return {
        id: randomUUID(),
        submissionId,
        createdAt: now().toISOString(),
        durationMs: Math.round(performance.now() - started),
        aiMode: deps.ai.mode,
        model: narrative.model ?? facts.model,
        narrativeSource: narrative.source,
        status: score.status,
        riskScore: score.riskScore,
        riskBand: score.riskBand,
        headline: narrative.headline,
        summary: narrative.summary,
        findings: checks.findings.map((f) => ({ ...f, explanation: narrative.explanations[f.id] ?? f.explanation })),
        checks: checks.checks,
        metrics: score.metrics,
        recommendedAction: score.recommendedAction,
        legalExposure: score.legalExposure,
        aiObservations,
        facts,
        stages,
        inputHash,
      } satisfies Review;
    },
  };
}

import type {
  EmissionsReport,
  ReviewStatus,
  SubmissionDetail,
  SubmissionStage,
  SubmissionSummary,
} from "@zerocarbon/shared";
import type { AppDeps } from "../app.ts";
import { HttpError } from "../lib/http.ts";
import type { Store } from "../store/store.ts";
import type { SubmissionCatalog, SubmissionIdentity, SubmissionRecord } from "../types.ts";
import type { StageProbe } from "./review-runner.ts";

export interface SummaryFilters {
  status?: ReviewStatus;
  stage?: SubmissionStage;
  q?: string;
}

export async function requireRecord(catalog: SubmissionCatalog, id: string): Promise<SubmissionRecord> {
  const record = await catalog.get(id);
  if (!record) throw new HttpError(404, `Submission ${id} not found`);
  return record;
}

export function buildSummary(store: Store, probe: StageProbe, record: SubmissionRecord): SubmissionSummary {
  const review = store.getLatestReview(record.id);
  const decision = store.getLatestDecision(record.id);
  const stage: SubmissionStage = probe.isRunning(record.id)
    ? "reviewing"
    : probe.failure(record.id)
      ? "failed"
      : decision
        ? "decided"
        : review
          ? "reviewed"
          : "not_reviewed";
  return {
    id: record.id,
    source: record.source,
    facilityName: record.facilityName,
    facilityShortName: record.facilityShortName,
    operator: record.operator,
    eadId: record.eadId,
    emirate: record.emirate,
    sector: record.sector,
    reportingYear: record.reportingYear,
    submittedOn: record.submittedOn,
    reportedTotalTco2e: record.reportedTotalTco2e ?? review?.metrics.reportedTotalTco2e,
    documentCount: record.documentCount,
    lat: record.lat,
    lon: record.lon,
    stage,
    status: review?.status,
    riskScore: review?.riskScore,
    riskBand: review?.riskBand,
    findingCount: review?.findings.length,
    estimatedUnderReportingTco2e: review?.metrics.estimatedUnderReportingTco2e,
    decision: decision?.action,
    reviewedAt: review?.createdAt,
  };
}

/** Reviewed first (highest risk first), then not reviewed (most recently submitted first). */
export function compareSummaries(a: SubmissionSummary, b: SubmissionSummary): number {
  const aReviewed = a.riskScore !== undefined;
  const bReviewed = b.riskScore !== undefined;
  if (aReviewed !== bReviewed) return aReviewed ? -1 : 1;
  const byKey = aReviewed
    ? (b.riskScore ?? 0) - (a.riskScore ?? 0)
    : (b.submittedOn ?? "").localeCompare(a.submittedOn ?? "");
  return byKey || a.facilityName.localeCompare(b.facilityName);
}

export async function listSummaries(
  deps: Pick<AppDeps, "catalog" | "store">,
  probe: StageProbe,
  filters: SummaryFilters = {},
): Promise<SubmissionSummary[]> {
  const q = filters.q?.trim().toLowerCase();
  return (await deps.catalog.list())
    .map((record) => buildSummary(deps.store, probe, record))
    .filter(
      (s) =>
        (!filters.status || s.status === filters.status) &&
        (!filters.stage || s.stage === filters.stage) &&
        (!q || [s.facilityName, s.facilityShortName, s.operator, s.eadId].some((v) => v.toLowerCase().includes(q))),
    )
    .sort(compareSummaries);
}

export async function getDetail(deps: Pick<AppDeps, "catalog" | "store">, probe: StageProbe, id: string): Promise<SubmissionDetail> {
  const record = await requireRecord(deps.catalog, id);
  const pkg = await deps.catalog.loadPackage(id);
  return {
    ...buildSummary(deps.store, probe, record),
    documents: pkg.documents,
    report: pkg.report,
    evidence: pkg.evidence,
    review: deps.store.getLatestReview(id),
    decisions: deps.store.listDecisions(id),
    letters: deps.store.listLetters(id),
  };
}

export function buildIdentity(record: SubmissionRecord, report?: EmissionsReport): SubmissionIdentity {
  return {
    submissionId: record.id,
    facilityName: record.facilityName,
    facilityShortName: record.facilityShortName,
    operator: report?.operator.name || record.operator,
    operatorAr: report?.operator.nameAr,
    eadId: record.eadId,
    permit: report?.facility.permit,
    reportingYear: record.reportingYear,
    submittedOn: record.submittedOn ?? report?.submittedOn,
    contactName: report?.contacts?.ghgLead ?? report?.contacts?.facilityManager,
  };
}

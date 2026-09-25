import type { DashboardResponse, DecisionAction, ReviewStatus, SubmissionStage } from "@zerocarbon/shared";
import type { AppDeps } from "../app.ts";
import type { StageProbe } from "./review-runner.ts";
import { listSummaries } from "./summaries.ts";

const round = (n: number) => Math.round(n * 100) / 100;

export async function buildDashboard(deps: Pick<AppDeps, "catalog" | "store" | "aiMode" | "now">, probe: StageProbe): Promise<DashboardResponse> {
  const summaries = await listSummaries(deps, probe);
  const byStatus: Record<ReviewStatus, number> = { compliant: 0, needs_clarification: 0, non_compliant: 0 };
  const byStage: Record<SubmissionStage, number> = { not_reviewed: 0, reviewing: 0, reviewed: 0, decided: 0, failed: 0 };
  const decisions: Record<DecisionAction, number> = { approve: 0, request_clarification: 0, escalate_inspection: 0, refer_penalty: 0 };
  const years = new Map<number, number>();
  const durations: number[] = [];
  let totalReported = 0;
  let underReported = 0;

  for (const s of summaries) {
    byStage[s.stage]++;
    if (s.status) byStatus[s.status]++;
    if (s.decision) decisions[s.decision]++;
    years.set(s.reportingYear, (years.get(s.reportingYear) ?? 0) + 1);
    totalReported += s.reportedTotalTco2e ?? 0;
    underReported += s.estimatedUnderReportingTco2e ?? 0;
    const review = deps.store.getLatestReview(s.id);
    if (review) durations.push(review.durationMs);
  }

  const [reportingYear] = [...years].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0] ?? [(deps.now?.() ?? new Date()).getUTCFullYear() - 1];
  return {
    reportingYear,
    submissions: summaries.length,
    reviewed: durations.length,
    byStatus,
    byStage,
    totalReportedTco2e: round(totalReported),
    estimatedUnderReportingTco2e: round(underReported),
    ...(durations.length ? { averageReviewMs: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) } : {}),
    decisions,
    topRisks: summaries.filter((s) => s.riskScore !== undefined).slice(0, 5),
    aiMode: deps.aiMode,
  };
}

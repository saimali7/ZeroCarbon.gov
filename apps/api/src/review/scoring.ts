/**
 * Review status, risk score, metrics and recommended action from the deterministic check results.
 *
 * riskScore = round(min(100, findingsScore + materialityScore))
 *   findingsScore (max 70): the most serious finding sets a base, each further finding adds an increment.
 *     base          breach: critical 44, high 32, medium 18, low 6
 *                   clarification: critical/high 18, medium 10, low 4
 *                   signal: critical/high 10, medium 5, low 2; info 0
 *     increment     breach +3, clarification +2, signal +1 (info 0)
 *   materialityScore (max 30): 1.5 points per 1% of estimated under-reporting
 *     (sum of finding impacts with countsTowardTotal, over the reported total).
 * riskBand: critical >= 75, high >= 50, medium >= 25, otherwise low.
 * status: non_compliant if any high/critical breach or under-reporting >= 5% (materiality);
 *         needs_clarification if any clarification, any other breach or a high/critical signal;
 *         otherwise compliant.
 */
import type { DecisionAction, Finding, FindingOutcome, RecommendedAction, ReviewMetrics, ReviewStatus, RiskBand, RuleId, Severity } from "@zerocarbon/shared";
import { benchmarkStats, facilityIntensity, priorYearStats } from "../checks/benchmark.ts";
import { MATERIALITY_PCT } from "../checks/index.ts";
import { fmt, round, sum } from "../checks/util.ts";
import type { ChecksResult, ReviewInput, ScoreResult } from "../types.ts";

const BASE: Record<FindingOutcome, Record<Severity, number>> = {
  breach: { critical: 44, high: 32, medium: 18, low: 6, info: 0 },
  clarification: { critical: 18, high: 18, medium: 10, low: 4, info: 0 },
  signal: { critical: 10, high: 10, medium: 5, low: 2, info: 0 },
};
const INCREMENT: Record<FindingOutcome, number> = { breach: 3, clarification: 2, signal: 1 };
const FINDINGS_MAX = 70;
const MATERIALITY_MAX = 30;
const POINTS_PER_PCT = 1.5;
const RESPONSE_DAYS = 30;

const isSerious = (f: Finding) => f.severity === "critical" || f.severity === "high";

export function riskScore(findings: Finding[], underReportingPct: number): number {
  const weight = (f: Finding) => BASE[f.outcome][f.severity];
  const [top, ...rest] = findings.filter((f) => f.severity !== "info").sort((a, b) => weight(b) - weight(a));
  const findingsScore = top ? Math.min(FINDINGS_MAX, weight(top) + sum(rest.map((f) => INCREMENT[f.outcome]))) : 0;
  const materialityScore = Math.min(MATERIALITY_MAX, Math.max(0, underReportingPct) * POINTS_PER_PCT);
  return Math.round(Math.min(100, findingsScore + materialityScore));
}

export const riskBand = (score: number): RiskBand => (score >= 75 ? "critical" : score >= 50 ? "high" : score >= 25 ? "medium" : "low");

function reviewStatus(findings: Finding[], underReportingPct: number): ReviewStatus {
  if (findings.some((f) => f.outcome === "breach" && isSerious(f)) || underReportingPct >= MATERIALITY_PCT) return "non_compliant";
  if (findings.some((f) => (f.outcome !== "signal" && f.severity !== "info") || (f.outcome === "signal" && isSerious(f)))) return "needs_clarification";
  return "compliant";
}

function reviewMetrics(input: ReviewInput, findings: Finding[]): ReviewMetrics {
  const r = input.report;
  const reported = r.totals.totalCo2eT;
  const mmboe = r.production?.mmboe;
  const under = Math.round(sum(findings.filter((f) => f.impact?.countsTowardTotal && f.impact.tco2e > 0).map((f) => f.impact!.tco2e)));
  const corrected = reported + under;
  const intensity = facilityIntensity(r);
  const peers = benchmarkStats(input);
  const prior = priorYearStats(input);
  return {
    reportedTotalTco2e: reported,
    co2T: r.totals.co2T,
    ch4T: r.totals.ch4T,
    ...(mmboe ? { productionMmboe: mmboe, ch4IntensityTPerMmboe: round(r.totals.ch4T / mmboe, 1) } : {}),
    ...(intensity !== undefined ? { intensityKgCo2ePerBoe: round(intensity, 2) } : {}),
    ...(peers.intensity
      ? {
          peerMedianIntensity: round(peers.intensity.median, 2),
          peerMinIntensity: peers.intensity.min,
          peerMaxIntensity: peers.intensity.max,
          intensityPercentile: peers.intensity.percentile,
        }
      : {}),
    ...(prior
      ? {
          priorYearTotalTco2e: prior.priorTotal,
          yoyTotalPct: round(prior.yoyTotalPct, 1),
          ...(prior.yoyProductionPct !== undefined ? { yoyProductionPct: round(prior.yoyProductionPct, 1) } : {}),
        }
      : {}),
    estimatedUnderReportingTco2e: under,
    estimatedUnderReportingPct: reported > 0 ? round((under / reported) * 100, 1) : 0,
    correctedTotalTco2e: corrected,
    ...(mmboe ? { correctedIntensityKgCo2ePerBoe: round(corrected / (mmboe * 1000), 2) } : {}),
  };
}

function recommend(status: ReviewStatus, findings: Finding[], metrics: ReviewMetrics, passed: number): RecommendedAction {
  if (status === "compliant") {
    const info = findings.filter((f) => f.severity === "info").length;
    return {
      primary: "approve",
      alsoConsider: [],
      rationale: `${passed} checks passed${info ? `; ${info} informational signal${info > 1 ? "s" : ""} explained by declared events` : ""}. No breaches or open questions.`,
      ruleIds: [],
    };
  }
  const breaches = findings.filter((f) => f.outcome === "breach");
  const satellite = findings.filter((f) => f.category === "satellite" && f.outcome === "signal" && isSerious(f));
  const signals = sum(satellite.map((f) => Number(f.metrics.corroborated ?? 0) + Number(f.metrics.unexplained ?? 0)));
  const inspection = satellite.length > 0 || breaches.some((f) => f.severity === "critical");
  const lateBreach = breaches.some((f) => f.category === "deadline");
  const planUpdate = findings.some((f) => f.ruleIds.includes("EAD-TGD-MP-UPDATE") || (f.outcome === "breach" && f.category === "methane"));
  const alsoConsider: DecisionAction[] = [...(inspection ? (["escalate_inspection"] as const) : []), ...(lateBreach ? (["refer_penalty"] as const) : [])];
  const ruleIds: RuleId[] = ["EAD-TGD-CORRECTIONS", ...(planUpdate ? (["EAD-TGD-MP-UPDATE"] as const) : []), ...(inspection ? (["EAD-TGD-INSPECTION"] as const) : [])];

  const under = metrics.estimatedUnderReportingTco2e;
  const pct = metrics.estimatedUnderReportingPct;
  const parts = [
    under > 0
      ? `Estimated under-reporting of ${fmt(under)} t CO2e (${fmt(pct, 1)}% of the reported total) is ${pct >= MATERIALITY_PCT ? "above" : "below"} the ${MATERIALITY_PCT}% materiality threshold.`
      : "",
    breaches.length ? `${breaches.length} breach${breaches.length > 1 ? "es" : ""}: ${breaches.map((f) => f.title).join("; ")}.` : "",
    `Send a written notice setting out the ${breaches.length ? "violations" : "open questions"} and requiring ${status === "non_compliant" ? "a corrected report" : "a written response"}` +
      `${planUpdate ? " and a revised Monitoring Plan" : ""} within ${RESPONSE_DAYS} days (errors must be corrected within 30 days of discovery).`,
    inspection
      ? `Consider a site inspection to verify the activity data${signals ? `: ${signals} satellite methane signal${signals > 1 ? "s are" : " is"} not explained by declared events (a signal, not proof)` : ""}.`
      : "",
    lateBreach ? "The report was submitted after the grace period." : "",
  ];
  return { primary: "request_clarification", alsoConsider, rationale: parts.filter(Boolean).join(" "), responseDays: RESPONSE_DAYS, ruleIds };
}

export function scoreReview(input: ReviewInput, result: ChecksResult): ScoreResult {
  const { findings, checks } = result;
  const metrics = reviewMetrics(input, findings);
  const status = reviewStatus(findings, metrics.estimatedUnderReportingPct);
  const score = riskScore(findings, metrics.estimatedUnderReportingPct);
  const passed = checks.filter((c) => c.status === "pass").length;
  const breaches = findings.some((f) => f.outcome === "breach");
  return {
    status,
    riskScore: score,
    riskBand: riskBand(score),
    metrics,
    recommendedAction: recommend(status, findings, metrics, passed),
    ...(breaches
      ? {
          legalExposure: {
            text:
              "If not remedied: a breach of the Article 6(1) reporting obligations of Decree-Law 11/2024 is punishable under Art. 15 by a fine of AED 50,000 to AED 2,000,000, imposed by the courts; " +
              "under Art. 16 the penalty is doubled if the same act is repeated within two years of a previous final conviction. " +
              "EAD's guidance (Step 6) first provides for a written notice setting out the violation, the corrective action and a deadline.",
            ruleIds: ["DL11-2024-ART6-1", "DL11-2024-ART15", "DL11-2024-ART16", "EAD-TGD-INSPECTION"],
          },
        }
      : {}),
  };
}

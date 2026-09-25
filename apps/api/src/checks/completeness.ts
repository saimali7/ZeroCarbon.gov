/** Completeness, submission deadline and reporting threshold. */
import type { CheckContext, CheckOutput, DraftFinding } from "./context.ts";
import { daysBetween, fmt, formatDate, withinTolerance } from "./util.ts";

/** Reporting threshold for covered sectors, t CO2e per year. */
const REPORTING_THRESHOLD_TCO2E = 25_000;
const DEADLINE = "03-31";
const GRACE_END = "04-14";

export function completenessChecks(ctx: CheckContext): CheckOutput[] {
  return [requiredContent(ctx), submissionDeadline(ctx), reportingThreshold(ctx)];
}

function requiredContent(ctx: CheckContext): CheckOutput {
  const { report: r, year } = ctx;
  const base = { checkId: "completeness.required_content", title: "Required report content", category: "completeness" } as const;
  const missing: string[] = [];
  const unclear: string[] = [];

  if (!r.facility.eadId) unclear.push("EAD facility registration ID missing (C1)");
  if (!r.facility.permit) unclear.push("Environmental permit number missing (C1)");
  if (!r.operator.name) unclear.push("Operator legal name missing (C1)");
  if (r.period.start !== `${year}-01-01` || r.period.end !== `${year}-12-31`)
    unclear.push(`Reporting period ${r.period.start} to ${r.period.end} does not cover calendar year ${year}`);
  if (!(r.totals.co2T > 0)) missing.push("CO2 emissions not reported");
  if (!(r.totals.ch4T > 0) && !r.methane.length) missing.push("CH4 emissions not reported (sheet G)");
  if (!r.sourceStreams.length) missing.push("No source streams reported (D1/D2)");
  missing.push(...r.warnings.filter((w) => /sheet/i.test(w) && /missing|not found|absent|empty/i.test(w)));
  const letterTotal = ctx.facts.coverLetter?.reportedTotalTco2e;
  if (letterTotal !== undefined && !withinTolerance(letterTotal, ctx.totalCo2e, 0, 1))
    unclear.push(`Cover letter total ${fmt(letterTotal)} t CO2e differs from the workbook total ${fmt(ctx.totalCo2e)} t CO2e`);

  if (!missing.length && !unclear.length) {
    const ids = [r.facility.eadId, r.facility.permit].join(", ");
    return {
      ...base,
      status: "pass",
      message: `Identifiers (${ids}), full ${year} period, CO2 and CH4, ${r.sourceStreams.length} source streams and all required sheets present`,
      findings: [],
    };
  }
  const items = [...missing, ...unclear];
  const finding: DraftFinding = {
    checkId: base.checkId,
    title: missing.length ? "Required report content missing" : "Report identifiers or period need clarification",
    category: "completeness",
    severity: missing.length ? "medium" : "low",
    outcome: missing.length ? "breach" : "clarification",
    summary: `${items.length} required item${items.length > 1 ? "s are" : " is"} missing or inconsistent: ${items[0]}${items.length > 1 ? "; ..." : ""}.`,
    details: items,
    evidence: [ctx.reportRef("C1", "(a) Operator, (b) Facility, (d) Reporting"), ctx.reportRef("C2", "(f) Emissions summary")],
    ruleIds: missing.length ? ["EAD-TGD-COMPLETENESS", "DL11-2024-ART6-1"] : ["EAD-TGD-COMPLETENESS"],
    metrics: { missingItems: missing.length, unclearItems: unclear.length },
  };
  return { ...base, status: "fail", message: finding.summary, findings: [finding] };
}

function submissionDeadline(ctx: CheckContext): CheckOutput {
  const base = { checkId: "deadline.submission", title: "Submission deadline", category: "deadline" } as const;
  const submitted = ctx.report.submittedOn ?? ctx.facts.coverLetter?.date;
  if (!submitted) return { ...base, status: "not_applicable", message: "Submission date not stated in the workbook or cover letter", findings: [] };
  const deadline = `${ctx.year + 1}-${DEADLINE}`;
  const grace = `${ctx.year + 1}-${GRACE_END}`;
  if (submitted <= deadline)
    return { ...base, status: "pass", message: `Submitted ${formatDate(submitted)}, on time (deadline ${formatDate(deadline)})`, findings: [] };

  const daysLate = daysBetween(deadline, submitted);
  const inGrace = submitted <= grace;
  const finding: DraftFinding = {
    checkId: base.checkId,
    title: inGrace ? "Report submitted in the grace period" : "Report submitted after the deadline",
    category: "deadline",
    severity: inGrace ? "low" : "medium",
    outcome: inGrace ? "clarification" : "breach",
    summary: inGrace
      ? `Submitted ${formatDate(submitted)}, ${daysLate} days after the ${formatDate(deadline)} deadline but within the grace period to ${formatDate(grace)}.`
      : `Submitted ${formatDate(submitted)}, ${daysLate} days after the ${formatDate(deadline)} deadline and after the grace period ended on ${formatDate(grace)}.`,
    details: [
      `Reporting year ${ctx.year}: the verified report is due by ${formatDate(deadline)} (grace period to ${formatDate(grace)}).`,
      inGrace ? "Ask the operator to confirm the reason for the late submission." : "Late submission is a breach of the reporting obligation.",
    ],
    evidence: [ctx.reportRef("C1", "(d) Reporting, Date of submission", { quote: formatDate(submitted) })],
    ruleIds: inGrace ? ["EAD-MRV-DEADLINE"] : ["EAD-MRV-DEADLINE", "DL11-2024-ART6-1"],
    metrics: { submittedOn: submitted, deadline, daysLate },
  };
  return { ...base, status: "fail", message: finding.summary, findings: [finding] };
}

function reportingThreshold(ctx: CheckContext): CheckOutput {
  const base = { checkId: "coverage.threshold", title: "Reporting threshold", category: "completeness" } as const;
  const total = ctx.totalCo2e;
  if (total >= REPORTING_THRESHOLD_TCO2E)
    return {
      ...base,
      status: "pass",
      message: `${fmt(total)} t CO2e reported, above the ${fmt(REPORTING_THRESHOLD_TCO2E)} t CO2e reporting threshold`,
      findings: [],
    };
  const finding: DraftFinding = {
    checkId: base.checkId,
    title: "Reported emissions below the reporting threshold",
    category: "completeness",
    severity: "low",
    outcome: "signal",
    summary: `${fmt(total)} t CO2e is below the ${fmt(REPORTING_THRESHOLD_TCO2E)} t CO2e threshold. Confirm whether the facility is designated or reporting voluntarily, and whether all sources are included.`,
    details: ["Facilities in covered sectors emitting 25,000 t CO2e or more per year must register and report."],
    evidence: [ctx.reportRef("C2", "(f) Emissions summary, TOTAL")],
    ruleIds: ["EAD-MRV-SCOPE"],
    metrics: { reportedTco2e: total, thresholdTco2e: REPORTING_THRESHOLD_TCO2E },
  };
  return { ...base, status: "warning", message: finding.summary, findings: [finding] };
}

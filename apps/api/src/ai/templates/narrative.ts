import type { DecisionAction, Finding, RecommendedAction, RegulationRule, ReviewMetrics } from "@zerocarbon/shared";
import type { NarrativeInput, NarrativeOutput } from "../../types.ts";
import {
  bySeverity,
  citationsEn,
  ensurePeriod,
  firstSentence,
  fmtIntensity,
  fmtPct,
  fmtT,
  isActionable,
  joinEn,
  lcFirst,
  plural,
  stripPeriod,
  ucFirst,
} from "../format.ts";
import { CATEGORY, benchmarkSentence, trendSentence } from "./phrases.ts";

export type NarrativeText = Omit<NarrativeOutput, "source" | "model">;

const ACTION_PHRASE: Record<DecisionAction, (days: number) => string> = {
  approve: () => "approve the report",
  request_clarification: (days) => `send a query requiring a corrected report within ${days} days`,
  escalate_inspection: () => "arrange a site inspection",
  refer_penalty: () => "refer the case for enforcement",
};
const ACTION_SHORT: Record<DecisionAction, string> = {
  approve: "approval",
  request_clarification: "a clarification request",
  escalate_inspection: "a site inspection",
  refer_penalty: "referral for enforcement",
};
const SIGNAL_LABEL: Partial<Record<Finding["category"], string>> = {
  satellite: "satellite detections",
  benchmark: "the peer comparison",
  trend: "the year-on-year trend",
};

export function nextStep(action: RecommendedAction): string {
  const main = ACTION_PHRASE[action.primary](action.responseDays ?? 30);
  const also = action.alsoConsider.filter((a) => a !== action.primary).map((a) => ACTION_SHORT[a]);
  return `${main}${also.length ? `; also consider ${joinEn(also)}` : ""}`;
}

/** Most important first: severity, then estimated impact. */
const byImpact = (a: Finding, b: Finding) => bySeverity(a, b) || (b.impact?.tco2e ?? 0) - (a.impact?.tco2e ?? 0);

export function headlineFor(input: Pick<NarrativeInput, "status" | "metrics" | "findings">): string {
  const m = input.metrics;
  const unreported = m.estimatedUnderReportingTco2e > 0 ? `about ${fmtT(m.estimatedUnderReportingTco2e)} t CO2e (${fmtPct(m.estimatedUnderReportingPct)})` : "";
  const issues = input.findings.filter(isActionable);
  if (input.status === "non_compliant") {
    if (unreported) return `Non-compliant: ${unreported} appears unreported`;
    const breaches = issues.filter((f) => f.outcome === "breach").length || issues.length;
    return `Non-compliant: ${plural(breaches, "breach", "breaches")} of the reporting rules found`;
  }
  if (input.status === "needs_clarification") {
    return `Needs clarification: ${plural(Math.max(issues.length, 1), "matter")} to resolve with the operator${unreported ? `, ${unreported} may be unreported` : ""}`;
  }
  return `Compliant: ${fmtT(m.reportedTotalTco2e)} t CO2e reported, no material issues found`;
}

function signalsSentence(findings: Finding[]): string {
  const labels = [...new Set(findings.filter((f) => f.outcome === "signal" && f.severity !== "info").map((f) => SIGNAL_LABEL[f.category]))].filter(
    (l): l is string => Boolean(l),
  );
  if (!labels.length) return "";
  const single = labels.length === 1 && !labels[0].endsWith("s");
  return `${ucFirst(joinEn(labels))} should be treated as ${single ? "a signal" : "signals"} to investigate, not as proof on ${single ? "its" : "their"} own.`;
}

function intensitySentence(m: ReviewMetrics): string {
  if (m.intensityKgCo2ePerBoe == null) return "";
  const i = fmtIntensity(m.intensityKgCo2ePerBoe);
  if (m.peerMinIntensity != null && m.peerMaxIntensity != null) {
    const inRange = m.intensityKgCo2ePerBoe >= m.peerMinIntensity && m.intensityKgCo2ePerBoe <= m.peerMaxIntensity;
    const range = `${fmtIntensity(m.peerMinIntensity)} to ${fmtIntensity(m.peerMaxIntensity)}`;
    return `The reported intensity of ${i} kg CO2e/boe is ${inRange ? "within" : "outside"} the peer range (${range}).`;
  }
  return m.peerMedianIntensity != null ? `The reported intensity is ${i} kg CO2e/boe against a peer median of ${fmtIntensity(m.peerMedianIntensity)}.` : "";
}

const titles = (list: Finding[]) => list.slice(0, 3).map((f) => lcFirst(stripPeriod(f.title)));

export function summaryFor(input: NarrativeInput): string {
  const { identity: id, metrics: m, findings } = input;
  const statusText = { non_compliant: "assessed as non-compliant", needs_clarification: "flagged as needing clarification", compliant: "assessed as compliant" }[
    input.status
  ];
  const sentences = [
    `${id.facilityShortName || id.facilityName} (${id.eadId}) reported ${fmtT(m.reportedTotalTco2e)} t CO2e for ${id.reportingYear} and is ${statusText}, with a risk score of ${input.riskScore} out of 100.`,
  ];
  const issues = findings.filter(isActionable).sort(byImpact);
  if (input.status === "compliant") {
    const applicable = input.checks.filter((c) => c.status !== "not_applicable");
    const passed = applicable.filter((c) => c.status === "pass").length;
    const checks = applicable.length ? `${passed} of ${applicable.length} checks passed` : "";
    const notes = findings.filter((f) => !isActionable(f));
    if (issues.length)
      sentences.push(`${checks ? `${checks}; ` : ""}${plural(issues.length, "finding")} still ${issues.length === 1 ? "needs" : "need"} attention: ${joinEn(titles(issues), "; ")}.`);
    else sentences.push(`${checks ? `${checks} and no` : "No"} breaches were found.`);
    if (notes.length) sentences.push(`${plural(notes.length, "point")} ${notes.length === 1 ? "is" : "are"} noted for information: ${joinEn(titles(notes), "; ")}.`);
    const intensity = intensitySentence(m);
    if (intensity) sentences.push(intensity);
  } else {
    const main = titles(issues);
    const nc = input.status === "non_compliant";
    if (main.length === 1) sentences.push(`The main ${nc ? "problem" : "matter to clarify"} is ${main[0]}.`);
    else if (main.length) sentences.push(`The main ${nc ? "problems" : "matters to clarify"} are ${joinEn(main, "; ")}.`);
    if (m.estimatedUnderReportingTco2e > 0) {
      const ci = m.correctedIntensityKgCo2ePerBoe;
      const detail = ci != null ? ` (${fmtIntensity(ci)} kg CO2e/boe${m.peerMedianIntensity != null ? `, against a peer median of ${fmtIntensity(m.peerMedianIntensity)}` : ""})` : "";
      sentences.push(
        `Together these suggest that about ${fmtT(m.estimatedUnderReportingTco2e)} t CO2e (${fmtPct(m.estimatedUnderReportingPct)}) was not reported; the corrected total would be about ${fmtT(m.correctedTotalTco2e)} t CO2e${detail}.`,
      );
    }
    const signals = signalsSentence(findings);
    if (signals) sentences.push(signals);
  }
  sentences.push(`Recommended next step: ${nextStep(input.recommendedAction)}.`);
  return sentences.join(" ");
}

/** One plain-language paragraph: what was found, why it matters under the rules, what to ask the operator. */
export function explainFinding(f: Finding, rules: RegulationRule[], metrics?: ReviewMetrics): string {
  const c = CATEGORY[f.category];
  let what = firstSentence(f.summary) || ensurePeriod(f.title);
  if (metrics && f.category === "benchmark" && !/\d/.test(what)) what = ensurePeriod(benchmarkSentence(metrics)?.en ?? what);
  if (metrics && f.category === "trend" && !/\d/.test(what)) what = ensurePeriod(trendSentence(metrics)?.en ?? what);
  const impact = f.impact && f.impact.tco2e > 0 ? fmtT(f.impact.tco2e) : "";
  if (impact && !what.includes(impact)) what = `${stripPeriod(what)}, with an estimated impact of about ${impact} t CO2e.`;
  what = ensurePeriod(what);
  if (f.severity === "info") return `${what} This is recorded for information and needs no action.`;
  const cites = citationsEn(f.ruleIds, rules);
  return `${what} ${c.whyEn}${cites.length ? ` (${cites.join("; ")})` : ""}. ${c.askEn}`;
}

export function narrativeTemplate(input: NarrativeInput): NarrativeText {
  return {
    headline: headlineFor(input),
    summary: summaryFor(input),
    explanations: Object.fromEntries(input.findings.map((f) => [f.id, explainFinding(f, input.rules, input.metrics)])),
  };
}

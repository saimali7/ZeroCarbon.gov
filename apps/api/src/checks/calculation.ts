/** Recalculation of source streams, methane lines, totals and monthly activity. */
import type { MethaneLine } from "@zerocarbon/shared";
import { AR5_GWP_CH4, MATERIALITY_PCT, pctOfTotal, recomputeStreamCo2, type CheckContext, type CheckOutput, type DraftFinding } from "./context.ts";
import { fmt, fmtSignedPct, formatMonth, parseNumber, relDiff, round, sum, withinTolerance } from "./util.ts";

/** Tolerance for recalculations from activity data and factors. */
const CALC_TOLERANCE = 0.005;
/** Tolerance for plain additions (totals, monthly sums). */
const SUM_TOLERANCE = 0.001;
/** Methane lines are reported to 0.1 t. */
const CH4_ABS_TOLERANCE_T = 0.15;
const CH4_REL_TOLERANCE = 0.01;

export function calculationChecks(ctx: CheckContext): CheckOutput[] {
  return [sourceStreams(ctx), monthlyConsistency(ctx)];
}

/** Recomputes CH4 from the basis text of common methods (volume x factor, energy x kg/TJ, device counts...). */
export function recomputeMethane(line: MethaneLine, ldarCh4T?: number): { ch4: number; formula: string } | undefined {
  const { basis, method } = line;
  let m = basis.match(/([\d,]+(?:\.\d+)?)\s*Sm3\b[^x\u00d7]*[x\u00d7]\s*([\d.]+)\s*t\s*CH4\s*\/\s*10\^?3\s*Sm3/i);
  if (m) return { ch4: (parseNumber(m[1]) / 1000) * parseNumber(m[2]), formula: `${m[1]} Sm3 x ${m[2]} t CH4/10^3 Sm3` };
  const tj = basis.match(/([\d,]+(?:\.\d+)?)\s*TJ\b/i);
  const kg = method.match(/([\d.]+)\s*kg\s*CH4\s*\/\s*TJ/i);
  if (tj && kg) return { ch4: (parseNumber(tj[1]) * parseNumber(kg[1])) / 1000, formula: `${tj[1]} TJ x ${kg[1]} kg CH4/TJ` };
  m = basis.match(/([\d,]+(?:\.\d+)?)\s*t\s*CH4\s*[x\u00d7]\s*\(\s*1\s*-\s*([\d.]+)\s*%/i);
  if (m) return { ch4: parseNumber(m[1]) * (1 - parseNumber(m[2]) / 100), formula: `${m[1]} t CH4 x (1 - ${m[2]}%)` };
  m = basis.match(/(\d+)\s+\w+\s*[x\u00d7]\s*([\d.]+)\s*kg\s*CH4\s*\/\s*day\s*[x\u00d7]\s*(\d+)\s*days/i);
  if (m) return { ch4: (parseNumber(m[1]) * parseNumber(m[2]) * parseNumber(m[3])) / 1000, formula: `${m[1]} x ${m[2]} kg CH4/day x ${m[3]} days` };
  const items = [...basis.matchAll(/(\d+)\s[^;]*?[x\u00d7]\s*([\d.]+)\s*t\s*\/\s*yr/gi)];
  if (items.length) return { ch4: sum(items.map((i) => parseNumber(i[1]) * parseNumber(i[2]))), formula: "device count x emission factor (t/yr)" };
  if (ldarCh4T !== undefined && /LDAR/i.test(`${basis} ${method}`)) return { ch4: ldarCh4T, formula: "LDAR survey summary total" };
  return undefined;
}

function sourceStreams(ctx: CheckContext): CheckOutput {
  const { report: r } = ctx;
  const base = { checkId: "calculation.source_streams", title: "Recalculation of source streams and totals", category: "calculation" } as const;
  if (!r.sourceStreams.length) return { ...base, status: "not_applicable", message: "No source streams to recalculate", findings: [] };

  const issues: string[] = [];
  const skipped: string[] = [];
  let co2Correction = 0;
  let ch4Correction = 0;

  for (const s of r.sourceStreams) {
    const calc = recomputeStreamCo2(s);
    if (!calc) {
      skipped.push(s.id);
      continue;
    }
    if (calc.energyTj !== undefined && s.energyTj !== undefined && !withinTolerance(s.energyTj, calc.energyTj, CALC_TOLERANCE, 0.1))
      issues.push(`${s.id}: energy ${fmt(s.energyTj, 1)} TJ reported vs ${fmt(calc.energyTj, 1)} TJ recalculated`);
    if (!withinTolerance(s.co2T, calc.co2, CALC_TOLERANCE, 1)) {
      issues.push(`${s.id} ${s.name}: ${fmt(s.co2T)} t CO2 reported vs ${fmt(calc.co2)} t recalculated (${calc.formula}, ${fmtSignedPct(relDiff(s.co2T, calc.co2) * 100)})`);
      co2Correction += calc.co2 - s.co2T;
    }
  }
  const streamSum = sum(r.sourceStreams.map((s) => s.co2T));
  if (!withinTolerance(r.totals.co2T, streamSum, SUM_TOLERANCE, 1)) {
    issues.push(`Total CO2 ${fmt(r.totals.co2T)} t differs from the sum of source streams ${fmt(streamSum)} t`);
    co2Correction += streamSum - r.totals.co2T;
  }

  const ldar = ctx.facts.ldar?.annualCh4T;
  let recomputedLines = 0;
  for (const line of r.methane) {
    if (line.ch4T === null) continue;
    const calc = recomputeMethane(line, ldar);
    if (calc) {
      recomputedLines++;
      if (!withinTolerance(line.ch4T, calc.ch4, CH4_REL_TOLERANCE, CH4_ABS_TOLERANCE_T)) {
        issues.push(`${line.id}: ${fmt(line.ch4T, 1)} t CH4 reported vs ${fmt(calc.ch4, 1)} t from its basis (${calc.formula})`);
        ch4Correction += calc.ch4 - line.ch4T;
      }
    }
    if (line.gwp !== null && line.gwp !== AR5_GWP_CH4) issues.push(`${line.id}: GWP ${line.gwp} used instead of ${AR5_GWP_CH4} (IPCC AR5)`);
    if (line.gwp !== null && line.co2eT !== null && !withinTolerance(line.co2eT, line.ch4T * line.gwp, CALC_TOLERANCE, 1))
      issues.push(`${line.id}: ${fmt(line.co2eT)} t CO2e reported vs ${fmt(line.ch4T * line.gwp)} t (CH4 x GWP)`);
  }
  const lineSum = sum(r.methane.map((l) => l.ch4T ?? 0));
  if (r.methane.length && !withinTolerance(r.totals.ch4T, lineSum, SUM_TOLERANCE, 0.2)) {
    issues.push(`Total CH4 ${fmt(r.totals.ch4T, 1)} t differs from the sum of methane lines ${fmt(lineSum, 1)} t`);
    ch4Correction += lineSum - r.totals.ch4T;
  }
  if (r.totals.gwpCh4 !== AR5_GWP_CH4) issues.push(`GWP for CH4 is ${r.totals.gwpCh4}; EAD requires ${AR5_GWP_CH4} (IPCC AR5, 100-year)`);
  if (!withinTolerance(r.totals.ch4Co2eT, r.totals.ch4T * AR5_GWP_CH4, SUM_TOLERANCE, 1))
    issues.push(`CH4 ${fmt(r.totals.ch4Co2eT)} t CO2e reported vs ${fmt(r.totals.ch4T * AR5_GWP_CH4)} t (${fmt(r.totals.ch4T, 1)} t x ${AR5_GWP_CH4})`);
  const expectedTotal = r.totals.co2T + r.totals.ch4Co2eT;
  if (!withinTolerance(r.totals.totalCo2eT, expectedTotal, SUM_TOLERANCE, 1))
    issues.push(`Total ${fmt(r.totals.totalCo2eT)} t CO2e differs from CO2 + CH4 = ${fmt(expectedTotal)} t CO2e`);

  if (!issues.length) {
    const checked = r.sourceStreams.length - skipped.length;
    const skippedNote = skipped.length ? `; ${skipped.join(", ")} not recalculable (units not recognised)` : "";
    return {
      ...base,
      status: "pass",
      message: `${checked} source streams recalculated within ${CALC_TOLERANCE * 100}%, ${recomputedLines} methane lines recalculated from their basis; totals consistent (GWP ${AR5_GWP_CH4}, IPCC AR5)${skippedNote}`,
      findings: [],
    };
  }

  const correctedTotal = r.totals.co2T + co2Correction + (r.totals.ch4T + ch4Correction) * AR5_GWP_CH4;
  const impact = Math.round(correctedTotal - r.totals.totalCo2eT);
  const share = pctOfTotal(ctx, impact);
  const material = share >= MATERIALITY_PCT;
  const finding: DraftFinding = {
    checkId: base.checkId,
    title: "Reported figures do not recalculate",
    category: "calculation",
    severity: material ? "high" : Math.abs(share) >= CALC_TOLERANCE * 100 ? "medium" : "low",
    outcome: material ? "breach" : "clarification",
    summary: `${issues.length} calculation discrepanc${issues.length > 1 ? "ies" : "y"} found; the recalculated total differs from the reported total by ${fmt(impact)} t CO2e (${fmtSignedPct(share)}).`,
    details: [...issues, ...(skipped.length ? [`Not recalculated: ${skipped.join(", ")} (units not recognised)`] : [])],
    evidence: [ctx.reportRef("D2", "(a) Annual calculation per source stream"), ctx.reportRef("G", "Methane lines and TOTAL METHANE"), ctx.reportRef("C2", "(f) Emissions summary")],
    ruleIds: issues.some((i) => /GWP/.test(i)) ? ["EAD-TGD-CORRECTIONS", "IPCC-AR5-GWP"] : ["EAD-TGD-CORRECTIONS"],
    ...(impact !== 0 ? { impact: { tco2e: impact, basis: "Recalculated total minus reported total", countsTowardTotal: impact > 0 } } : {}),
    metrics: { discrepancies: issues.length, recalculatedTotalTco2e: Math.round(correctedTotal), differenceTco2e: impact, differencePct: round(share, 1) },
  };
  return { ...base, status: "fail", message: finding.summary, findings: [finding] };
}

function monthlyConsistency(ctx: CheckContext): CheckOutput {
  const { report: r, year } = ctx;
  const base = { checkId: "calculation.monthly_consistency", title: "Monthly activity vs annual activity", category: "calculation" } as const;
  const months = r.monthly.filter((m) => m.month.startsWith(String(year)));
  if (!months.length) return { ...base, status: "not_applicable", message: "No monthly activity data reported (D2 (b))", findings: [] };

  const ids = [...new Set(months.flatMap((m) => Object.keys(m.byStream)))].filter((id) => ctx.stream(id));
  const issues: string[] = [];
  if (months.length < 12) issues.push(`Only ${months.length} of 12 months reported (${months.map((m) => formatMonth(m.month)).join(", ")})`);
  for (const id of ids) {
    const stream = ctx.stream(id)!;
    const total = sum(months.map((m) => m.byStream[id] ?? 0));
    if (!withinTolerance(total, stream.activity, SUM_TOLERANCE, 1))
      issues.push(`${id}: monthly values sum to ${fmt(total)} ${stream.activityUnit} vs ${fmt(stream.activity)} ${stream.activityUnit} annual (${fmtSignedPct(relDiff(total, stream.activity) * 100)})`);
  }
  if (!issues.length)
    return { ...base, status: "pass", message: `Monthly activity for ${ids.join(", ")} sums to the annual figures (${months.length} months)`, findings: [] };

  const finding: DraftFinding = {
    checkId: base.checkId,
    title: "Monthly activity does not add up to the annual figures",
    category: "calculation",
    severity: "medium",
    outcome: "clarification",
    summary: `${issues.length} inconsistenc${issues.length > 1 ? "ies" : "y"} between monthly and annual activity data: ${issues[0]}.`,
    details: issues,
    evidence: [ctx.reportRef("D2", "(b) Monthly activity data"), ctx.reportRef("D2", "(a) Annual calculation per source stream")],
    ruleIds: ["EAD-TGD-COMPLETENESS"],
    metrics: { inconsistencies: issues.length, monthsReported: months.length },
  };
  return { ...base, status: "fail", message: finding.summary, findings: [finding] };
}

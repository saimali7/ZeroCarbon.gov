/** Reported activity vs supporting evidence: fuel meter log, flare log, diesel invoices and the production gas balance. */
import type { EvidenceRef, SourceStream } from "@zerocarbon/shared";
import {
  MATERIALITY_PCT,
  csvRef,
  dayVolume,
  estimatePeriods,
  flareColumns,
  flareFactors,
  isFlareStream,
  pctOfTotal,
  type CheckContext,
  type CheckOutput,
  type DraftFinding,
} from "./context.ts";
import { fmt, fmtSignedPct, formatMonth, formatMonthRange, relDiff, round, sum, withinTolerance } from "./util.ts";

/** Evidence totals must match reported activity within this relative tolerance. */
const EVIDENCE_TOLERANCE = 0.005;
/** Flare meter vs gas balance deviation that must be investigated (operators' usual Monitoring Plan control). */
const BALANCE_DEVIATION_LIMIT = 0.1;

type Base = Pick<CheckOutput, "checkId" | "title" | "category">;

export function evidenceChecks(ctx: CheckContext): CheckOutput[] {
  return [fuelMeter(ctx), flareLog(ctx), diesel(ctx), gasBalance(ctx)];
}

interface Comparison {
  stream: SourceStream;
  source: string;
  evidenceTotal: number;
  monthly?: Map<string, number>;
  extraIssues?: string[];
}

function compare(ctx: CheckContext, c: Comparison) {
  const { stream: s } = c;
  const unit = s.activityUnit;
  const issues = [...(c.extraIssues ?? [])];
  const annualOk = withinTolerance(s.activity, c.evidenceTotal, EVIDENCE_TOLERANCE);
  if (!annualOk)
    issues.push(`${s.id}: reported ${fmt(s.activity, 1)} ${unit} vs ${fmt(c.evidenceTotal, 1)} ${unit} in the ${c.source} (${fmtSignedPct(relDiff(s.activity, c.evidenceTotal) * 100)})`);
  for (const m of ctx.report.monthly) {
    const evidence = c.monthly?.get(m.month);
    const reported = m.byStream[s.id];
    if (evidence !== undefined && reported !== undefined && !withinTolerance(reported, evidence, EVIDENCE_TOLERANCE))
      issues.push(`${s.id} ${formatMonth(m.month)}: reported ${fmt(reported)} vs ${fmt(evidence)} ${unit} (${fmtSignedPct(relDiff(reported, evidence) * 100)})`);
  }
  const underActivity = annualOk ? 0 : Math.max(0, c.evidenceTotal - s.activity);
  return { issues, underCo2: s.activity > 0 ? underActivity * (s.co2T / s.activity) : 0 };
}

function comparisonOutput(ctx: CheckContext, base: Base, comparisons: Comparison[], failTitle: string, evidence: EvidenceRef[], passMessage: string): CheckOutput {
  const results = comparisons.map((c) => compare(ctx, c));
  const issues = results.flatMap((r) => r.issues);
  if (!issues.length) return { ...base, status: "pass", message: passMessage, findings: [] };

  const impact = Math.round(sum(results.map((r) => r.underCo2)));
  const share = pctOfTotal(ctx, impact);
  const material = share >= MATERIALITY_PCT;
  const finding: DraftFinding = {
    checkId: base.checkId,
    title: failTitle,
    category: "evidence",
    severity: material ? "high" : impact > 0 ? "medium" : "low",
    outcome: material ? "breach" : "clarification",
    summary: `${issues[0]}${issues.length > 1 ? ` (and ${issues.length - 1} more)` : ""}.${impact > 0 ? ` The evidence implies about ${fmt(impact)} t CO2 more than reported (${fmt(share, 1)}% of the total).` : ""}`,
    details: issues,
    evidence: [...evidence, ...comparisons.map((c) => c.stream.evidence)],
    ruleIds: material ? ["EAD-TGD-COMPLETENESS", "EAD-TGD-CORRECTIONS", "DL11-2024-ART6-1"] : ["EAD-TGD-COMPLETENESS", "EAD-TGD-CORRECTIONS"],
    ...(impact > 0 ? { impact: { tco2e: impact, basis: "Evidence activity minus reported activity, at the stream's reported CO2 per unit", countsTowardTotal: true } } : {}),
    metrics: { discrepancies: issues.length, impactTco2: impact },
  };
  return { ...base, status: "fail", message: finding.summary, findings: [finding] };
}

function fuelMeter(ctx: CheckContext): CheckOutput {
  const base: Base = { checkId: "evidence.fuel_meter", title: "Fuel meter log vs reported fuel gas", category: "evidence" };
  const log = ctx.evidence.fuelMeter;
  if (!log?.months.length) return { ...base, status: "not_applicable", message: "No fuel gas meter log provided", findings: [] };
  const comparisons: Comparison[] = [];
  const unlinked: string[] = [];
  for (const tag of new Set(log.months.map((m) => m.meterTag))) {
    const stream = ctx.report.sourceStreams.find((s) => s.meterTag === tag);
    const months = log.months.filter((m) => m.meterTag === tag);
    if (!stream) {
      unlinked.push(tag);
      continue;
    }
    const withNcv = months.filter((m) => m.ncvMjPerSm3 !== undefined);
    const volume = sum(withNcv.map((m) => m.volumeSm3));
    const ncv = volume > 0 ? sum(withNcv.map((m) => m.volumeSm3 * m.ncvMjPerSm3!)) / volume : undefined;
    const extraIssues =
      ncv !== undefined && stream.ncv !== undefined && !withinTolerance(stream.ncv, ncv, EVIDENCE_TOLERANCE)
        ? [`${stream.id}: NCV ${fmt(stream.ncv, 2)} MJ/Sm3 reported vs volume-weighted ${fmt(ncv, 2)} MJ/Sm3 in the ${tag} log`]
        : [];
    comparisons.push({
      stream,
      source: `${tag} meter log`,
      evidenceTotal: sum(months.map((m) => m.volumeSm3)),
      monthly: new Map(months.map((m) => [m.month, m.volumeSm3])),
      extraIssues,
    });
  }
  if (!comparisons.length)
    return { ...base, status: "not_applicable", message: `Meter ${unlinked.join(", ")} in the log is not named by any source stream`, findings: [] };
  const pass = comparisons.map((c) => `${c.source} matches ${c.stream.id} (${fmt(c.stream.activity)} ${c.stream.activityUnit})`).join("; ");
  return comparisonOutput(ctx, base, comparisons, "Fuel meter log does not match reported fuel gas", [csvRef(log, `All ${log.months.length} monthly rows`)], `${pass}, annually and for every month`);
}

function flareLog(ctx: CheckContext): CheckOutput {
  const base: Base = { checkId: "evidence.flare_log", title: "Flare log vs reported flare volumes", category: "evidence" };
  const log = ctx.evidence.flareLog;
  if (!log?.days.length) return { ...base, status: "not_applicable", message: "No daily flare log provided", findings: [] };
  const comparisons: Comparison[] = flareColumns(ctx)
    .filter((c) => c.stream)
    .map((col) => {
      const monthly = new Map<string, number>();
      for (const d of log.days) monthly.set(d.date.slice(0, 7), (monthly.get(d.date.slice(0, 7)) ?? 0) + dayVolume(d, col.key));
      return { stream: col.stream!, source: `flare log (${col.label})`, evidenceTotal: sum(log.days.map((d) => dayVolume(d, col.key))), monthly };
    });
  if (!comparisons.length) return { ...base, status: "not_applicable", message: "Flare log columns could not be linked to a flare source stream", findings: [] };
  const pass = comparisons.map((c) => `${c.stream.id} (${fmt(c.stream.activity)} Sm3)`).join(" and ");
  return comparisonOutput(
    ctx,
    base,
    comparisons,
    "Flare log does not match reported flare volumes",
    [csvRef(log, `All ${log.days.length} daily rows`)],
    `Flare log daily totals match ${pass}, annually and for every month`,
  );
}

function diesel(ctx: CheckContext): CheckOutput {
  const base: Base = { checkId: "evidence.diesel", title: "Diesel invoices vs reported consumption", category: "evidence" };
  const log = ctx.evidence.dieselInvoices;
  const stream = ctx.report.sourceStreams.find((s) => /diesel|gas ?oil/i.test(`${s.name} ${s.type}`));
  if (!log?.invoices.length) return { ...base, status: "not_applicable", message: "No diesel invoices provided", findings: [] };
  if (!stream) return { ...base, status: "not_applicable", message: "No diesel source stream reported", findings: [] };

  const deliveries = sum(log.invoices.map((i) => i.massT || (i.litres * (i.densityKgPerL ?? 0)) / 1000));
  const stock = ctx.report.dieselStock ?? {};
  const opening = stock.openingT ?? 0;
  const closing = stock.closingT ?? 0;
  const consumption = deliveries + opening - closing;
  const extraIssues: string[] = [];
  if (stock.deliveriesT !== undefined && !withinTolerance(stock.deliveriesT, deliveries, EVIDENCE_TOLERANCE))
    extraIssues.push(`Deliveries ${fmt(stock.deliveriesT, 1)} t in D2 (c) vs ${fmt(deliveries, 1)} t on ${log.invoices.length} invoices`);
  if (stock.openingT === undefined || stock.closingT === undefined) extraIssues.push("Opening or closing diesel stock not reported (D2 (c))");
  const formula = `${log.invoices.length} invoices (${fmt(deliveries, 1)} t) + opening stock ${fmt(opening, 1)} t - closing stock ${fmt(closing, 1)} t = ${fmt(consumption, 1)} t`;
  return comparisonOutput(
    ctx,
    base,
    [{ stream, source: `invoices and stock change (${formula})`, evidenceTotal: consumption, extraIssues }],
    "Diesel invoices do not reconcile with reported consumption",
    [csvRef(log, `All ${log.invoices.length} invoices`), ctx.reportRef("D2", "(c) Diesel stock reconciliation")],
    `${formula}, matching ${stream.id} (${fmt(stream.activity, 1)} t)`,
  );
}

interface BalanceMonth {
  month: string;
  reported: number;
  balance: number;
  deviating: boolean;
  below: boolean;
}

function gasBalance(ctx: CheckContext): CheckOutput {
  const base: Base = { checkId: "evidence.gas_balance", title: "Flare volumes vs production gas balance", category: "evidence" };
  const pb = ctx.evidence.productionBalance;
  const flares = ctx.report.sourceStreams.filter(isFlareStream);
  if (!pb?.months.length) return { ...base, status: "not_applicable", message: "No production gas balance provided", findings: [] };
  if (!flares.length) return { ...base, status: "not_applicable", message: "No flare source streams reported", findings: [] };

  // Reported flare per month from D2 (b); the flare log is the fallback when D2 has no monthly split.
  const logMonthly = new Map<string, number>();
  for (const col of flareColumns(ctx).filter((c) => c.stream))
    for (const d of ctx.evidence.flareLog?.days ?? []) logMonthly.set(d.date.slice(0, 7), (logMonthly.get(d.date.slice(0, 7)) ?? 0) + dayVolume(d, col.key));
  const rows: BalanceMonth[] = [];
  for (const m of [...pb.months].sort((a, b) => a.month.localeCompare(b.month))) {
    const byStream = ctx.report.monthly.find((x) => x.month === m.month)?.byStream;
    const reported = byStream && flares.some((s) => byStream[s.id] !== undefined) ? sum(flares.map((s) => byStream[s.id] ?? 0)) : logMonthly.get(m.month);
    if (reported === undefined || !(m.flaredByBalanceSm3 > 0)) continue;
    const dev = relDiff(reported, m.flaredByBalanceSm3);
    rows.push({ month: m.month, reported, balance: m.flaredByBalanceSm3, deviating: Math.abs(dev) > BALANCE_DEVIATION_LIMIT, below: dev < 0 });
  }
  if (!rows.length) return { ...base, status: "not_applicable", message: "No months with both reported flare volumes and a gas balance figure", findings: [] };

  // Contiguous months that agree, or deviate in the same direction, form one period.
  const groups: BalanceMonth[][] = [];
  for (const row of rows) {
    const last = groups[groups.length - 1]?.at(-1);
    if (last && last.deviating === row.deviating && (!row.deviating || last.below === row.below)) groups[groups.length - 1].push(row);
    else groups.push([row]);
  }
  const estimates = estimatePeriods(ctx).filter((p) => p.origin === "flare_log");
  const periods = groups.map((g) => {
    const reported = sum(g.map((r) => r.reported));
    const balance = sum(g.map((r) => r.balance));
    const from = g[0].month;
    const to = g[g.length - 1].month;
    const estimate = estimates.find((p) => p.start.slice(0, 7) <= to && p.end.slice(0, 7) >= from);
    return { rows: g, from, to, label: formatMonthRange(from, to), reported, balance, dev: relDiff(reported, balance), deviating: g[0].deviating, below: g[0].below, estimate };
  });
  const deviating = periods.filter((p) => p.deviating);
  const annualDev = relDiff(sum(rows.map((r) => r.reported)), sum(rows.map((r) => r.balance)));
  if (!deviating.length) {
    const maxDev = Math.max(...rows.map((r) => Math.abs(relDiff(r.reported, r.balance))));
    return {
      ...base,
      status: "pass",
      message: `Reported flare within ${fmt(maxDev * 100, 1)}% of the gas balance in each of ${rows.length} months (annual ${fmtSignedPct(annualDev * 100)})`,
      findings: [],
    };
  }

  const factors = flareFactors(ctx);
  const under = deviating.filter((p) => p.below);
  const gap = sum(under.map((p) => p.balance - p.reported));
  const co2 = factors.co2PerKSm3 !== undefined ? Math.round((gap / 1000) * factors.co2PerKSm3) : undefined;
  const ch4 = factors.ch4PerKSm3 !== undefined ? round((gap / 1000) * factors.ch4PerKSm3, 1) : 0;
  const ch4Co2e = Math.round(ch4 * ctx.gwp);
  const impact = co2 !== undefined && gap > 0 ? co2 + ch4Co2e : undefined;
  const share = impact !== undefined ? pctOfTotal(ctx, impact) : 0;
  const reportedDev = sum(deviating.map((p) => p.reported));
  const balanceDev = sum(deviating.map((p) => p.balance));
  const devPct = relDiff(reportedDev, balanceDev) * 100;
  const control = ctx.plan("reconciliation_control");

  const details = periods.map((p) => {
    const head = `${p.label}: reported ${fmt(p.reported)} Sm3 vs ${fmt(p.balance)} Sm3 by balance (${fmtSignedPct(p.dev * 100)})`;
    if (!p.deviating) return `${head}: agrees, so the balance is a reliable reference for this facility.`;
    const months = p.rows.map((r) => `${formatMonth(r.month).slice(0, 3)} ${fmtSignedPct(relDiff(r.reported, r.balance) * 100)}`).join(", ");
    return `${head}${p.estimate ? `; flare log data in this period are "${p.estimate.label}"` : ""}. Monthly: ${months}.`;
  });
  if (control)
    details.push(`The operator's own control (Monitoring Plan section ${control.section ?? "?"}) requires deviations greater than 10% to be investigated; no investigation or correction is reported.`);
  if (impact !== undefined)
    details.push(
      `Impact: ${fmt(gap)} Sm3 x ${fmt(factors.co2PerKSm3!, 3)} t CO2/10^3 Sm3 = ${fmt(co2!)} t CO2` +
        (factors.ch4PerKSm3 !== undefined ? `; x ${fmt(factors.ch4PerKSm3, 4)} t CH4/10^3 Sm3 = ${fmt(ch4, 1)} t CH4 (x ${ctx.gwp} = ${fmt(ch4Co2e)} t CO2e)` : "") +
        ".",
    );

  const flareLogDoc = ctx.evidence.flareLog;
  const finding: DraftFinding = {
    checkId: base.checkId,
    title: under.length ? "Reported flare volumes contradict the facility's own gas balance" : "Reported flare volumes exceed the gas balance",
    category: "evidence",
    severity: !under.length ? "medium" : share >= MATERIALITY_PCT ? "critical" : "high",
    outcome: under.length ? "breach" : "clarification",
    summary:
      `${deviating.map((p) => p.label).join(", ")} reported flare volumes are ${fmt(Math.abs(devPct), 1)}% ${under.length ? "below" : "above"} the facility's own gas balance (${fmt(reportedDev)} vs ${fmt(balanceDev)} Sm3).` +
      (impact !== undefined ? ` The ${fmt(gap)} Sm3 gap corresponds to about ${fmt(impact)} t CO2e (${fmt(co2!)} t CO2 + ${fmt(ch4, 1)} t CH4).` : ""),
    details,
    evidence: [
      ...deviating.map((p) => csvRef(pb, `Rows ${p.from} to ${p.to} (flared by balance)`, { rows: `${p.from}..${p.to}` })),
      ...deviating.map((p) => ctx.reportRef("D2", `(b) Monthly activity data, ${p.label}`, { rows: `${p.from}..${p.to}` })),
      ...deviating.flatMap((p) =>
        p.estimate && flareLogDoc ? [csvRef(flareLogDoc, `Rows ${p.estimate.start} to ${p.estimate.end} (${p.estimate.label})`, { rows: `${p.estimate.start}..${p.estimate.end}` })] : [],
      ),
      ...(control ? [control.evidence] : []),
    ],
    ruleIds: under.length ? ["EAD-TGD-COMPLETENESS", "DL11-2024-ART6-1"] : ["EAD-TGD-COMPLETENESS"],
    ...(impact !== undefined
      ? { impact: { tco2e: impact, basis: `Gas balance minus reported flare (${fmt(gap)} Sm3) at the reported flare CO2 factor and CH4 slip factor`, countsTowardTotal: true } }
      : {}),
    metrics: {
      periodStart: deviating[0].from,
      periodEnd: deviating[deviating.length - 1].to,
      reportedSm3: reportedDev,
      balanceSm3: balanceDev,
      deviationPct: round(devPct, 1),
      gapSm3: gap,
      ...(co2 !== undefined ? { gapCo2T: co2, gapCh4T: ch4, gapCo2eT: impact ?? 0 } : {}),
    },
  };
  return { ...base, status: "fail", message: finding.summary, findings: [finding] };
}

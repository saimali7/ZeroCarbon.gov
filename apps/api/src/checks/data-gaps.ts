/** Undeclared estimates in the evidence and meter calibration validity. */
import type { EvidenceRef, IsoDate, RuleId, SourceStream } from "@zerocarbon/shared";
import {
  csvRef,
  daySource,
  dayVolume,
  estimatePeriods,
  flareColumns,
  flareFactors,
  isFlareStream,
  sortedDays,
  type CheckContext,
  type CheckOutput,
  type DraftFinding,
  type EstimatePeriod,
} from "./context.ts";
import { addDays, clip, fmt, formatDate, formatDateRange, isEstimatedSource, mean, monthEnd, parsePeriod, round, sum } from "./util.ts";

/** Share of a stream resting on undeclared estimates above which the gap is critical. */
const CRITICAL_STREAM_SHARE = 0.5;
/** Share above which an undeclared gap is high severity (also when longer than LONG_GAP_DAYS). */
const MATERIAL_STREAM_SHARE = 0.05;
/** Gaps longer than this require a Monitoring Plan revision. */
const LONG_GAP_DAYS = 30;
/** Indicative substitution (the operators' own Monitoring Plan method, not an EAD rule): average of the preceding 30 days. */
const SUBSTITUTION_WINDOW_DAYS = 30;

export function dataGapChecks(ctx: CheckContext): CheckOutput[] {
  const periods = estimatePeriods(ctx);
  const meters = meterCalibrations(ctx);
  const gaps = undeclaredEstimates(ctx, periods, meters);
  return [gaps.output, calibrationValidity(ctx, periods, meters, gaps.byStream)];
}

// ---------------------------------------------------------------------------
// Calibration status per metered source stream
// ---------------------------------------------------------------------------

interface MeterCalibration {
  stream: SourceStream;
  tag: string;
  nextDue?: IsoDate;
  calibratedOn?: IsoDate;
  certificateNo?: string;
  failed: boolean;
  /** First day in the reporting period without a valid calibration. */
  invalidFrom?: IsoDate;
  ref?: EvidenceRef;
  basis: "certificate" | "register" | "none";
}

function meterCalibrations(ctx: CheckContext): MeterCalibration[] {
  const { start, end } = ctx.report.period;
  return ctx.report.sourceStreams
    .filter((s) => s.meterTag)
    .map((stream) => {
      const tag = stream.meterTag!;
      const cert = ctx.facts.calibration.find((c) => c.tag === tag);
      const reg = ctx.report.instruments.find((i) => i.tag === tag);
      const nextDue = cert?.nextDue ?? reg?.nextDue;
      const failed = !!cert?.result && /fail/i.test(cert.result);
      const invalidFrom = failed ? (cert?.calibratedOn ?? start) : nextDue && nextDue < end ? addDays(nextDue, 1) : undefined;
      return {
        stream,
        tag,
        nextDue,
        calibratedOn: cert?.calibratedOn ?? reg?.lastCalibration,
        certificateNo: cert?.certificateNo ?? reg?.certificate,
        failed,
        invalidFrom,
        ref: cert?.evidence ?? reg?.evidence,
        basis: cert ? "certificate" : reg ? "register" : "none",
      };
    });
}

const calibrationText = (m: MeterCalibration) =>
  `${m.tag} calibration${m.certificateNo ? ` (certificate ${m.certificateNo}${m.calibratedOn ? `, calibrated ${formatDate(m.calibratedOn)}` : ""})` : ""} ` +
  (m.failed ? "failed" : `expired on ${formatDate(m.nextDue!)} and was not renewed in the reporting period`);

// ---------------------------------------------------------------------------
// Undeclared estimates
// ---------------------------------------------------------------------------

/** Units of an estimated period not covered by a data gap declared in H1 for the same stream or meter. */
function undeclaredUnits(ctx: CheckContext, p: EstimatePeriod) {
  const keys = [p.stream?.id, p.meterTag].filter((k): k is string => !!k);
  const gaps = ctx.report.dataGaps.filter((g) => keys.some((k) => `${g.sourceStream} ${g.cause}`.includes(k)));
  const ranges = gaps.map((g) => parsePeriod(g.period, ctx.year));
  // A declared gap whose period cannot be read is taken at face value.
  if (ranges.some((r) => !r)) return [];
  return p.units.filter((u) => !ranges.some((r) => r!.start <= u.end && r!.end >= u.start));
}

const periodKey = (p: EstimatePeriod) => p.stream?.id ?? p.meterTag ?? p.label;

function undeclaredEstimates(
  ctx: CheckContext,
  periods: EstimatePeriod[],
  meters: MeterCalibration[],
): { byStream: Map<string, DraftFinding>; output: CheckOutput } {
  const base = { checkId: "data_gaps.undeclared_estimates", title: "Estimated data declared as data gaps", category: "data_gap" } as const;
  const byStream = new Map<string, DraftFinding>();
  const { flareLog, fuelMeter } = ctx.evidence;
  if (!flareLog?.days.length && !fuelMeter?.months.length)
    return { byStream, output: { ...base, status: "not_applicable", message: "No daily or monthly meter logs to test for estimated data", findings: [] } };

  const undeclared = periods.filter((p) => undeclaredUnits(ctx, p).length);
  for (const key of new Set(undeclared.map(periodKey)))
    byStream.set(key, gapFinding(ctx, undeclared.filter((p) => periodKey(p) === key), meters));

  if (!byStream.size) {
    const describe = (p: EstimatePeriod) => `${p.stream?.id ?? p.meterTag ?? "unlinked"}, ${formatDateRange(p.start, p.end)}, ${p.units.length} ${p.unit}${p.units.length > 1 ? "s" : ""}`;
    const scanned = [flareLog ? `${flareLog.days.length} flare log days` : "", fuelMeter ? `${fuelMeter.months.length} fuel meter months` : ""].filter(Boolean).join(" and ");
    const message = periods.length
      ? `${periods.length} estimated period${periods.length > 1 ? "s" : ""} in the evidence (${periods.map(describe).join("; ")}), declared in H1`
      : `No estimated or substituted values in ${scanned}`;
    return { byStream, output: { ...base, status: "pass", message, findings: [] } };
  }
  const findings = [...byStream.values()];
  return { byStream, output: { ...base, status: "fail", message: findings.map((f) => f.title).join("; "), findings } };
}

function gapFinding(ctx: CheckContext, periods: EstimatePeriod[], meters: MeterCalibration[]): DraftFinding {
  const { report: r } = ctx;
  const first = periods[0];
  const stream = first.stream;
  const tag = first.meterTag ?? stream?.meterTag;
  const unit = stream?.activityUnit ?? "Sm3";
  const units = periods.flatMap((p) => undeclaredUnits(ctx, p));
  const count = units.length;
  const unitName = `${first.unit}${count > 1 ? "s" : ""}`;
  const days = first.unit === "day" ? count : sum(units.map((u) => Number(u.end.slice(8, 10))));
  const volume = sum(units.map((u) => u.value));
  const share = stream && stream.activity > 0 ? volume / stream.activity : 0;
  const start = units[0].start;
  const end = units[units.length - 1].end;
  const source = first.origin === "flare_log" ? ctx.evidence.flareLog! : ctx.evidence.fuelMeter!;
  const sourceName = first.origin === "flare_log" ? "flare log" : "fuel meter log";
  const perUnit = first.unit === "day" ? `${unit}/d` : `${unit}/month`;

  // Metered values of the same column, for comparison and for an indicative substitution.
  const metered: { date: string; value: number }[] =
    first.origin === "flare_log" && first.key
      ? sortedDays(ctx)
          .filter((d) => !isEstimatedSource(daySource(d, first.key!)))
          .map((d) => ({ date: d.date, value: dayVolume(d, first.key!) }))
      : (ctx.evidence.fuelMeter?.months ?? [])
          .filter((m) => m.meterTag === tag && !isEstimatedSource(m.status))
          .map((m) => ({ date: `${m.month}-01`, value: m.volumeSm3 }));
  const avgEstimated = volume / count;
  const avgMetered = metered.length ? mean(metered.map((m) => m.value)) : undefined;
  const lowerPct = avgMetered ? (1 - avgEstimated / avgMetered) * 100 : undefined;
  const distinct = new Set(units.map((u) => u.value)).size;
  const window = metered.filter((m) => m.date < start).slice(first.unit === "day" ? -SUBSTITUTION_WINDOW_DAYS : -1);
  const substitute = window.length ? mean(window.map((m) => m.value)) * count : undefined;
  const extra = substitute !== undefined ? Math.max(0, substitute - volume) : 0;
  const flare = !!stream && isFlareStream(stream);
  const factors = flareFactors(ctx);
  const co2PerUnit = flare && factors.co2PerKSm3 !== undefined ? factors.co2PerKSm3 / 1000 : stream && stream.activity > 0 ? stream.co2T / stream.activity : 0;
  const ch4PerUnit = flare && factors.ch4PerKSm3 !== undefined ? factors.ch4PerKSm3 / 1000 : 0;
  const indicative = Math.round(extra * co2PerUnit + round(extra * ch4PerUnit, 1) * ctx.gwp);

  const calibration = meters.find((m) => m.stream === stream && m.invalidFrom && m.invalidFrom <= end);
  const procedure = ctx.plan("data_gap_procedure");
  const claims: { text: string; ref?: EvidenceRef }[] = [];
  if (r.dataGapsDeclaredNone) claims.push({ text: "H1 (a) states that there were no data gaps", ref: ctx.reportRef("H1", "(a) Data gaps during the reporting period") });
  if (stream?.activityTier && tag)
    claims.push({ text: `D1 declares ${stream.id} activity data as ${stream.activityTier}, measured by ${stream.measurement ?? tag}`, ref: ctx.reportRef("D1", `row ${stream.id}`, { rows: stream.id }) });
  const fallbackText = Object.entries(r.notApplicableSheets).find(([k]) => /^F(_|$)/.test(k))?.[1];
  if (!r.approaches.fallback)
    claims.push({
      text: `Sheet F: ${fallbackText ? `"${clip(fallbackText, 180)}"` : "no fallback approach applied"}`,
      ref: ctx.reportRef("F", "Fallback approach", fallbackText ? { quote: clip(fallbackText) } : undefined),
    });
  const instrument = r.instruments.find((i) => i.tag === tag);
  if (instrument?.status && /in service/i.test(instrument.status))
    claims.push({ text: `Sheet I lists ${tag} as "${instrument.status}"${instrument.nextDue ? ` with calibration due ${formatDate(instrument.nextDue)}` : ""}`, ref: instrument.evidence });
  for (const d of ctx.facts.coverLetter?.declarations ?? [])
    if (d.claim === "no_data_gaps") claims.push({ text: `Cover letter: "${clip(d.text, 180)}"`, ref: d.evidence });

  const summary =
    `From ${formatDate(start)} the ${sourceName} records "${first.label}" for ${stream ? `${stream.id} ${stream.name}` : "an unlinked meter"}${tag ? ` (${tag})` : ""} instead of metered data: ` +
    `${fmt(volume)} ${unit} over ${count} ${unitName}${stream ? `, ${fmt(share * 100, 0)}% of the stream` : ""}. ` +
    (calibration ? `The ${tag} calibration ${calibration.failed ? "failed" : `expired on ${formatDate(calibration.nextDue!)}`}. ` : "") +
    `None of this is declared as a data gap${r.dataGapsDeclaredNone ? "; H1 states there were no data gaps" : ""}.`;

  const details = [
    `${formatDateRange(start, end)}: ${count} ${unitName} recorded as "${first.label}", ${fmt(volume)} ${unit}${stream ? ` = ${fmt(share * 100, 1)}% of the reported ${fmt(stream.activity)} ${unit}` : ""}.`,
    ...(avgMetered !== undefined
      ? [`Estimated values average ${fmt(avgEstimated)} ${perUnit} against ${fmt(avgMetered)} ${perUnit} metered (${fmt(lowerPct!, 1)}% lower); only ${distinct} distinct values over ${count} ${unitName}.`]
      : []),
    ...(first.note ? [`${sourceName[0].toUpperCase()}${sourceName.slice(1)}, ${formatDate(first.start)}: "${clip(first.note, 220)}"`] : []),
    ...(calibration
      ? [
          `${calibrationText(calibration)}. Without a valid calibration the meter cannot support the declared ${stream?.activityTier ?? "tier"}` +
            (stream?.category === "Major" ? " (EAD expects major source streams to meet at least Tier 2)." : "."),
        ]
      : []),
    ...claims.map((c) => `Contradicted: ${c.text}.`),
    "EAD requires every data gap to be declared in H1 with its reason, the substitution method and the estimated emissions impact (t CO2e).",
    ...(procedure
      ? [`The operator's own Monitoring Plan (section ${procedure.section ?? "?"}) says: "${clip(procedure.text, 220)}" This procedure was not applied.`]
      : []),
    ...(days > LONG_GAP_DAYS
      ? [`A measurement outage of ${days} days is a significant change: the Monitoring Plan must be revised and resubmitted to EAD within 30 days.`]
      : []),
    ...(substitute !== undefined && extra > 0
      ? [
          `Indicative only: substituting the average of the ${window.length} metered ${first.unit}s before the gap (${fmt(substitute / count)} ${perUnit}, the operator's own substitution method) gives ${fmt(substitute)} ${unit}, ` +
            `${fmt(extra)} ${unit} more than reported (about ${fmt(indicative)} t CO2e).` +
            (flare ? " Not added to the total: the gas balance check quantifies the same gap." : ""),
        ]
      : []),
  ];

  const ruleIds: RuleId[] = ["EAD-TGD-DATA-GAPS"];
  if (days > LONG_GAP_DAYS) ruleIds.push("EAD-TGD-MP-UPDATE");
  if (stream?.activityTier) ruleIds.push("EAD-TGD-TIERS");
  ruleIds.push("DL11-2024-ART6-1");

  return {
    checkId: "data_gaps.undeclared_estimates",
    title: `Undeclared data gap: ${stream ? `${stream.id} ${stream.name}` : (tag ?? "meter")} estimated for ${count} ${unitName}`,
    category: "data_gap",
    severity: share >= CRITICAL_STREAM_SHARE ? "critical" : share >= MATERIAL_STREAM_SHARE || days > LONG_GAP_DAYS ? "high" : "medium",
    outcome: "breach",
    summary,
    details,
    evidence: [
      ...periods.map((p) => csvRef(source, `Rows ${p.start} to ${p.end} (${p.label})`, { rows: `${p.start}..${p.end}`, ...(p.note ? { quote: clip(p.note) } : {}) })),
      ...(stream ? [stream.evidence] : []),
      ...(calibration?.ref ? [calibration.ref] : []),
      ...claims.flatMap((c) => (c.ref ? [c.ref] : [])),
      ...(procedure ? [procedure.evidence] : []),
    ],
    ruleIds,
    ...(substitute !== undefined && extra > 0
      ? {
          impact: {
            tco2e: indicative,
            basis: `Indicative: ${SUBSTITUTION_WINDOW_DAYS}-day average substitution minus the estimates (${fmt(extra)} ${unit}); not counted to avoid double counting`,
            countsTowardTotal: false,
          },
        }
      : {}),
    metrics: {
      streamId: stream?.id ?? "",
      meterTag: tag ?? "",
      periodStart: start,
      periodEnd: end,
      estimatedUnits: count,
      estimatedVolume: volume,
      streamSharePct: round(share * 100, 1),
      avgEstimatedPerUnit: Math.round(avgEstimated),
      ...(avgMetered !== undefined ? { avgMeteredPerUnit: Math.round(avgMetered), estimatedLowerPct: round(lowerPct!, 1) } : {}),
      distinctValues: distinct,
    },
  };
}

// ---------------------------------------------------------------------------
// Calibration validity
// ---------------------------------------------------------------------------

function calibrationValidity(ctx: CheckContext, periods: EstimatePeriod[], meters: MeterCalibration[], gapFindings: Map<string, DraftFinding>): CheckOutput {
  const base = { checkId: "data_gaps.calibration_validity", title: "Meter calibration validity", category: "data_gap" } as const;
  if (!meters.length) return { ...base, status: "not_applicable", message: "No source stream names a measuring instrument", findings: [] };
  const known = meters.filter((m) => m.basis !== "none");
  if (!known.length) return { ...base, status: "not_applicable", message: "No calibration certificates or instrument register entries to check", findings: [] };

  const end = ctx.report.period.end;
  const findings: DraftFinding[] = [];
  const problems: string[] = [];
  for (const m of known.filter((k) => k.invalidFrom)) {
    const from = m.invalidFrom!;
    const linked = gapFindings.get(m.stream.id);
    if (linked && String(linked.metrics.periodEnd) >= from) {
      findings.push(linked);
      problems.push(`${calibrationText(m)} (${m.stream.id}); the period without calibration is reported with undeclared estimates`);
      continue;
    }
    // Declared estimates covering the rest of the period: the lapse is disclosed.
    if (!m.failed && periods.some((p) => p.stream === m.stream && p.start <= from && p.end >= end)) continue;

    const col = flareColumns(ctx).find((c) => c.stream === m.stream);
    const meteredAfter = col
      ? sortedDays(ctx).filter((d) => d.date >= from && !isEstimatedSource(daySource(d, col.key))).length
      : (ctx.evidence.fuelMeter?.months ?? []).filter((x) => x.meterTag === m.tag && monthEnd(x.month) >= from && !isEstimatedSource(x.status)).length;
    const hasEvidence = col ? !!ctx.evidence.flareLog?.days.length : !!ctx.evidence.fuelMeter?.months.some((x) => x.meterTag === m.tag);
    const tier = m.stream.activityTier ?? "the declared tier";
    const finding: DraftFinding = {
      checkId: base.checkId,
      title: meteredAfter ? `Metered data from ${m.tag} after its calibration lapsed` : `${m.tag} calibration not valid for the whole reporting period`,
      category: "data_gap",
      severity: meteredAfter > (col ? LONG_GAP_DAYS : 1) || m.failed ? "high" : "medium",
      outcome: meteredAfter || m.failed ? "breach" : "clarification",
      summary:
        `${calibrationText(m)}. ` +
        (meteredAfter
          ? `${meteredAfter} ${col ? "days" : "months"} of ${m.stream.id} data from ${formatDate(from)} are still reported as metered at ${tier}.`
          : hasEvidence
            ? `${m.stream.id} is reported at ${tier} for the full year.`
            : `No meter log shows how ${m.stream.id} was measured after that date, yet it is reported at ${tier} for the full year.`),
      details: [
        `${m.stream.id} ${m.stream.name}: ${m.stream.activityTier ?? "tier not stated"}, ${m.stream.measurement ?? m.tag}.`,
        `Calibration source: ${m.basis === "certificate" ? "calibration certificate" : "instrument register (sheet I)"}.`,
      ],
      evidence: [...(m.ref ? [m.ref] : []), m.stream.evidence],
      ruleIds: ["EAD-TGD-TIERS", "EAD-TGD-DATA-GAPS"],
      metrics: { meterTag: m.tag, nextDue: m.nextDue ?? "", meteredUnitsAfterExpiry: meteredAfter },
    };
    findings.push(finding);
    problems.push(finding.summary);
  }
  if (!findings.length) {
    const basis = known.every((m) => m.basis === "certificate") ? "certificates" : "certificates and instrument register";
    return { ...base, status: "pass", message: `${known.map((m) => m.tag).join(", ")} calibrated and valid through ${formatDate(end)} (${basis})`, findings: [] };
  }
  return { ...base, status: "fail", message: problems.join("; "), findings: [...new Set(findings)] };
}

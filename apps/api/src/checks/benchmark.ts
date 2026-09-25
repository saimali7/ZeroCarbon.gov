/** Peer benchmarks and year-on-year trend. Signals that support other findings, never breaches on their own. */
import type { EmissionsReport, PriorYearRecord } from "@zerocarbon/shared";
import type { ReviewInput } from "../types.ts";
import type { CheckContext, CheckOutput, DraftFinding } from "./context.ts";
import { fmt, fmtSignedPct, median, relDiff, round, shortName, sum } from "./util.ts";

const MIN_PEERS = 3;
/** Intensity change vs the prior year that the operator should explain (usual Monitoring Plan control). */
const TREND_INTENSITY_LIMIT_PCT = 10;

export interface Distribution {
  value: number;
  median: number;
  min: number;
  max: number;
  /** Share of peers with a lower value, 0-100. */
  percentile: number;
  count: number;
}

function distribution(value: number, peers: number[]): Distribution | undefined {
  const values = peers.filter((v) => Number.isFinite(v) && v > 0);
  if (values.length < MIN_PEERS) return undefined;
  return {
    value,
    median: median(values),
    min: Math.min(...values),
    max: Math.max(...values),
    percentile: Math.round((values.filter((v) => v < value).length / values.length) * 100),
    count: values.length,
  };
}

export const facilityIntensity = (r: EmissionsReport) =>
  r.totals.intensityKgCo2ePerBoe ?? (r.production?.mmboe ? r.totals.totalCo2eT / (r.production.mmboe * 1000) : undefined);

/**
 * Intensity and methane intensity against regulator peer benchmarks for the same reporting year.
 * The facility itself is excluded, so its median is the median of all other peers.
 */
export function benchmarkStats(input: ReviewInput) {
  const r = input.report;
  const peers = input.reference.peers.filter((p) => p.eadId !== r.facility.eadId && p.reportingYear === r.reportingYear);
  const intensity = facilityIntensity(r);
  const ch4Intensity = r.production?.mmboe ? r.totals.ch4T / r.production.mmboe : undefined;
  return {
    peers,
    intensity: intensity === undefined ? undefined : distribution(intensity, peers.map((p) => p.intensityKgCo2ePerBoe)),
    methane: ch4Intensity === undefined ? undefined : distribution(ch4Intensity, peers.map((p) => p.ch4IntensityTPerMmboe)),
  };
}

/** "SS-02/03" -> ["SS-02", "SS-03"]. */
const expandItem = (item: string) => {
  const parts = item.split("/");
  const prefix = parts[0].match(/^[A-Z]+-/)?.[0] ?? "";
  return parts.map((p) => (/^[A-Z]/.test(p) ? p : prefix + p));
};

/** Prior-year comparison from the regulator's records. */
export function priorYearStats(input: ReviewInput) {
  const r = input.report;
  const records = input.reference.priorYear.filter((p) => p.eadId === r.facility.eadId && p.reportingYear === r.reportingYear - 1);
  const totalRec = records.find((p) => p.item.toUpperCase() === "TOTAL");
  if (!totalRec?.tco2e) return undefined;
  const priorTotal = totalRec.tco2e;
  const total = r.totals.totalCo2eT;
  const priorMmboe = Number(totalRec.description.match(/([\d.]+)\s*MMboe/i)?.[1]) || undefined;
  const mmboe = r.production?.mmboe;
  const intensity = facilityIntensity(r);
  const priorIntensity = priorMmboe ? priorTotal / (priorMmboe * 1000) : undefined;
  return {
    records,
    totalRec,
    priorTotal,
    total,
    yoyTotalPct: relDiff(total, priorTotal) * 100,
    priorMmboe,
    yoyProductionPct: priorMmboe && mmboe ? relDiff(mmboe, priorMmboe) * 100 : undefined,
    intensityChangePct: priorIntensity && intensity ? relDiff(intensity, priorIntensity) * 100 : undefined,
  };
}

export function benchmarkChecks(ctx: CheckContext): CheckOutput[] {
  return [...peerBenchmarks(ctx), yearOnYear(ctx)];
}

function peerBenchmarks(ctx: CheckContext): CheckOutput[] {
  const intensityBase = { checkId: "benchmark.intensity", title: "Emissions intensity vs peers", category: "benchmark" } as const;
  const methaneBase = { checkId: "benchmark.methane_intensity", title: "Methane intensity vs peers", category: "benchmark" } as const;
  if (!ctx.report.production?.mmboe) {
    const message = "Production (MMboe) not reported, so intensities cannot be benchmarked";
    return [intensityBase, methaneBase].map((b) => ({ ...b, status: "not_applicable" as const, message, findings: [] }));
  }
  const stats = benchmarkStats(ctx.input);
  const range = (d: Distribution, digits: number) => `peer median ${fmt(d.median, digits)}, range ${fmt(d.min, digits)} to ${fmt(d.max, digits)}`;
  const assess = (d: Distribution | undefined) => (!d ? undefined : d.value < d.min ? "below" : d.value > d.max ? "above" : "within");
  const intensity = assess(stats.intensity);
  const methane = assess(stats.methane);
  const flagIntensity = intensity === "below" || intensity === "above";
  const flagMethane = methane === "below" || methane === "above";

  let finding: DraftFinding | undefined;
  if (flagIntensity || flagMethane) {
    const i = stats.intensity!;
    const m = stats.methane;
    const low = intensity === "below" || methane === "below";
    const r = ctx.report;
    const quantifiedLines = r.methane.filter((l) => l.status === "quantified" && (l.ch4T ?? 0) > 0).length;
    const peerSources = stats.peers.map((p) => p.methaneSourcesQuantified).filter((n) => n > 0);
    const parts = [
      flagIntensity
        ? `${fmt(i.value, 2)} kg CO2e/boe is ${intensity === "below" ? "the lowest" : "the highest"} in the peer set (${range(i, 1)})`
        : `${fmt(i.value, 2)} kg CO2e/boe (${range(i, 1)})`,
      ...(flagMethane && m ? [`methane intensity ${fmt(m.value, 1)} t CH4/MMboe is ${methane} the peer range of ${fmt(m.min, 1)} to ${fmt(m.max, 1)}`] : []),
    ];
    finding = {
      checkId: flagIntensity ? intensityBase.checkId : methaneBase.checkId,
      title: low ? `${flagIntensity && flagMethane ? "Emissions and methane intensity" : flagIntensity ? "Emissions intensity" : "Methane intensity"} below every peer` : "Emissions intensity above every peer",
      category: "benchmark",
      severity: low ? "medium" : "low",
      outcome: "signal",
      summary: `${parts.join("; ")}. ${low ? "A signal that supports the under-reporting findings, not a breach in itself." : "A signal of inefficiency, not a compliance issue in itself."}`,
      details: [
        `${i.count} peer facilities, reporting year ${ctx.year} (${ctx.reference.sources.peers ? "regulator peer benchmarks" : "peer benchmarks"}); this facility excluded, so the median is over the other peers.`,
        `Intensity percentile: ${i.percentile} (share of peers with a lower intensity).`,
        ...(m ? [`Methane intensity ${fmt(m.value, 1)} t CH4/MMboe vs ${range(m, 1)}; percentile ${m.percentile}.`] : []),
        ...(peerSources.length ? [`Methane sources quantified: ${quantifiedLines} in this report vs ${Math.min(...peerSources)} to ${Math.max(...peerSources)} at peers.`] : []),
      ],
      evidence: [
        ctx.referenceRef("peers", `Peer benchmarks RY${ctx.year}, ${i.count} facilities`, stats.peers.map((p) => p.eadId).join(",")),
        ctx.reportRef("C2", "(d) Dynamic data and (f) Emissions summary"),
      ],
      ruleIds: [],
      metrics: {
        intensity: round(i.value, 2),
        peerMedian: round(i.median, 2),
        peerMin: i.min,
        peerMax: i.max,
        percentile: i.percentile,
        peerCount: i.count,
        ...(m ? { ch4Intensity: round(m.value, 1), ch4PeerMedian: round(m.median, 1), ch4PeerMin: m.min, ch4PeerMax: m.max } : {}),
      },
    };
  }

  const run = (base: typeof intensityBase | typeof methaneBase, d: Distribution | undefined, flagged: boolean, unit: string, digits: number): CheckOutput => {
    if (!d) return { ...base, status: "not_applicable", message: `Fewer than ${MIN_PEERS} peers with this metric for ${ctx.year}`, findings: [] };
    const text = `${fmt(d.value, digits)} ${unit}, ${range(d, digits)}, percentile ${d.percentile}`;
    return flagged ? { ...base, status: "warning", message: `Outside the peer range: ${text}`, findings: [finding!] } : { ...base, status: "pass", message: `Within the peer range: ${text}`, findings: [] };
  };
  return [run(intensityBase, stats.intensity, flagIntensity, "kg CO2e/boe", 2), run(methaneBase, stats.methane, flagMethane, "t CH4/MMboe", 1)];
}

function yearOnYear(ctx: CheckContext): CheckOutput {
  const base = { checkId: "trend.year_on_year", title: "Year-on-year trend", category: "trend" } as const;
  const stats = priorYearStats(ctx.input);
  if (!stats) return { ...base, status: "not_applicable", message: `No ${ctx.year - 1} submission on record for this facility`, findings: [] };
  const r = ctx.report;
  const { priorTotal, total, yoyTotalPct, yoyProductionPct, intensityChangePct } = stats;
  const headline = `Total ${fmtSignedPct(yoyTotalPct)} (${fmt(priorTotal)} to ${fmt(total)} t CO2e)${yoyProductionPct !== undefined ? ` with production ${fmtSignedPct(yoyProductionPct)}` : ""}`;
  if (intensityChangePct === undefined || Math.abs(intensityChangePct) <= TREND_INTENSITY_LIMIT_PCT)
    return { ...base, status: "pass", message: `${headline}; intensity ${intensityChangePct !== undefined ? fmtSignedPct(intensityChangePct) : "not comparable"}`, findings: [] };

  // Item-level changes: the item that fell most, compared with the whole change.
  const items = stats.records
    .filter((p) => p !== stats.totalRec)
    .map((p: PriorYearRecord) => {
      const ids = expandItem(p.item);
      const streams = r.sourceStreams.filter((s) => ids.includes(s.id));
      const current = p.item.toUpperCase() === "CH4" ? r.totals.ch4Co2eT : streams.length ? sum(streams.map((s) => s.co2T)) : undefined;
      const prior = p.tco2e ?? p.co2T;
      const activity = streams.length && p.activity ? { prior: p.activity, current: sum(streams.map((s) => s.activity)), unit: p.unit ?? streams[0].activityUnit } : undefined;
      return current === undefined || prior === undefined ? undefined : { item: p.item, description: p.description, prior, current, change: current - prior, activity };
    })
    .filter((x) => x !== undefined)
    .sort((a, b) => a.change - b.change);
  const totalChange = total - priorTotal;
  const biggest = items[0];
  const mitigation = r.mitigation.filter((m) => /implement|complet|commission/i.test(m.status ?? "") && m.year === ctx.year && (m.reductionTco2ePerYear ?? 0) > 0);
  const mitigationT = sum(mitigation.map((m) => m.reductionTco2ePerYear ?? 0));
  const exceeds = biggest && totalChange < 0 && biggest.change < totalChange;
  const falling = yoyTotalPct < 0 && (yoyProductionPct ?? 0) > 0;

  const drivers = exceeds ? `${shortName(biggest.description)} (${biggest.item}) alone fell ${fmt(-biggest.change)} t, more than the whole ${fmt(-totalChange)} t decline` : "";
  const mitigationText = totalChange < 0 ? `mitigation implemented in ${ctx.year} explains about ${fmt(mitigationT)} t` : "";
  const explanation = drivers && mitigationText ? `${drivers}, and ${mitigationText}` : drivers || mitigationText;
  const summary =
    `Total emissions ${yoyTotalPct < 0 ? "fell" : "rose"} ${fmt(Math.abs(yoyTotalPct), 1)}% (${fmt(priorTotal)} to ${fmt(total)} t CO2e)` +
    (yoyProductionPct !== undefined ? ` while production ${yoyProductionPct >= 0 ? "rose" : "fell"} ${fmt(Math.abs(yoyProductionPct), 1)}%` : "") +
    `; intensity ${fmtSignedPct(intensityChangePct)}.` +
    (explanation ? ` ${explanation[0].toUpperCase()}${explanation.slice(1)}.` : "") +
    " A signal to investigate, not a breach in itself.";

  const finding: DraftFinding = {
    checkId: base.checkId,
    title: falling ? "Emissions fell while production rose" : `Emissions intensity changed ${fmtSignedPct(intensityChangePct)} year on year`,
    category: "trend",
    severity: "medium",
    outcome: "signal",
    summary,
    details: [
      `${ctx.year - 1}: ${fmt(priorTotal)} t CO2e${stats.priorMmboe ? `, ${fmt(stats.priorMmboe, 2)} MMboe` : ""}. ${ctx.year}: ${fmt(total)} t CO2e${r.production?.mmboe ? `, ${fmt(r.production.mmboe, 2)} MMboe` : ""}.`,
      ...items.map(
        (x) =>
          `${x.item} ${x.description}: ${fmt(x.prior)} to ${fmt(x.current)} t (${x.change >= 0 ? "+" : ""}${fmt(x.change)} t)` +
          (x.activity ? `; activity ${fmt(x.activity.prior)} to ${fmt(x.activity.current)} ${x.activity.unit} (${fmtSignedPct(relDiff(x.activity.current, x.activity.prior) * 100)})` : "") +
          ".",
      ),
      mitigation.length
        ? `Mitigation implemented in ${ctx.year}: ${mitigation.map((m) => `${m.id} ${m.measure} (${fmt(m.reductionTco2ePerYear ?? 0)} t/yr)`).join("; ")}.`
        : `No mitigation measure implemented in ${ctx.year} is reported in sheet J.`,
      `Intensity changes greater than ${TREND_INTENSITY_LIMIT_PCT}% should be explained by the operator.`,
    ],
    evidence: [ctx.referenceRef("priorYear", `Prior-year submission RY${ctx.year - 1}, ${r.facility.eadId}`, r.facility.eadId), ctx.reportRef("C2", "(f) Emissions summary"), ctx.reportRef("J", "(a) Actions, plans and studies")],
    ruleIds: [],
    metrics: {
      priorTotalTco2e: priorTotal,
      totalTco2e: total,
      yoyTotalPct: round(yoyTotalPct, 1),
      ...(yoyProductionPct !== undefined ? { yoyProductionPct: round(yoyProductionPct, 1) } : {}),
      intensityChangePct: round(intensityChangePct, 1),
      totalChangeT: totalChange,
      ...(biggest ? { largestDropItem: biggest.item, largestDropT: -biggest.change } : {}),
      mitigationImplementedT: mitigationT,
    },
  };
  return { ...base, status: "warning", message: finding.summary, findings: [finding] };
}

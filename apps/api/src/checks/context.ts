/** Check context, shared types and derivations used by several check groups. */
import type {
  CheckStatus,
  DocumentFacts,
  EmissionsReport,
  EvidenceData,
  EvidenceRef,
  Finding,
  FindingCategory,
  FlareLogDay,
  IsoDate,
  MethaneLine,
  MonitoringPlanTopic,
  PlanStatementFact,
  ReferenceData,
  RuleId,
  Severity,
  SourceStream,
} from "@zerocarbon/shared";
import type { ReviewInput } from "../types.ts";
import { daysBetween, extractTags, isEstimatedSource, monthEnd, nextMonth, sum } from "./util.ts";

/** A finding before ids are assigned. Rule ids are restricted to the regulations corpus. */
export type DraftFinding = Omit<Finding, "id" | "ruleIds"> & { ruleIds: RuleId[] };

/** One CheckRun plus the findings it produced (a finding may be shared by several checks). */
export interface CheckOutput {
  checkId: string;
  title: string;
  category: FindingCategory;
  status: CheckStatus;
  message: string;
  findings: DraftFinding[];
}

/** Regulatory materiality threshold, % of total reported emissions. */
export const MATERIALITY_PCT = 5;
/** IPCC AR5 100-year GWP of CH4, used for every impact estimate. */
export const AR5_GWP_CH4 = 28;

export const SEVERITY_ORDER: readonly Severity[] = ["critical", "high", "medium", "low", "info"];
export const CATEGORY_ORDER: readonly FindingCategory[] = [
  "completeness",
  "deadline",
  "calculation",
  "evidence",
  "data_gap",
  "emission_factor",
  "methane",
  "benchmark",
  "trend",
  "satellite",
  "verification",
  "declaration",
];

const DEFAULT_SHEETS: Record<string, string> = {
  C1: "C1_Identifiers",
  C2: "C2_Facility_Description",
  D1: "D1_Source_Streams",
  D2: "D2_Calculation_Approach",
  F: "F_Fallback_Approach",
  G: "G_Methane",
  H1: "H1_Verification_Data_Gaps",
  I: "I_Management_QA",
  J: "J_Mitigation_Measures",
};

export type ReferenceKind = "peers" | "priorYear" | "satellite";
/** Document ids used in evidence refs pointing at regulator reference data (not part of the submission). */
export const REFERENCE_DOCUMENT_IDS: Record<ReferenceKind, string> = {
  peers: "ref-peer-benchmarks",
  priorYear: "ref-prior-year",
  satellite: "ref-satellite",
};
const REFERENCE_FILES: Record<ReferenceKind, string> = {
  peers: "peer-benchmarks.csv",
  priorYear: "prior-year-submissions.csv",
  satellite: "satellite-methane-detections.geojson",
};

export interface CheckContext {
  input: ReviewInput;
  report: EmissionsReport;
  evidence: EvidenceData;
  facts: DocumentFacts;
  reference: ReferenceData;
  year: number;
  gwp: number;
  totalCo2e: number;
  stream(id: string): SourceStream | undefined;
  /** Workbook sheet name for a template key ("D2" -> "D2_Calculation_Approach"). */
  sheet(key: string): string;
  reportRef(sheetKey: string, locator: string, extra?: Partial<EvidenceRef>): EvidenceRef;
  referenceRef(kind: ReferenceKind, locator: string, rows?: string): EvidenceRef;
  plan(topic: MonitoringPlanTopic): PlanStatementFact | undefined;
  plans(topic: MonitoringPlanTopic): PlanStatementFact[];
}

export function createContext(input: ReviewInput): CheckContext {
  const { report } = input;
  const reportDoc = input.documents.find((d) => d.id === report.documentId);
  const reportFile = reportDoc?.fileName ?? report.sourceStreams[0]?.evidence.fileName ?? report.documentId;
  const sheets = new Set(reportDoc?.sheetNames ?? []);
  for (const item of [...report.sourceStreams, ...report.methane, ...report.instruments, ...report.dataGaps])
    if (item.evidence.sheet) sheets.add(item.evidence.sheet);
  const sheet = (key: string) => [...sheets].find((s) => s === key || s.startsWith(`${key}_`)) ?? DEFAULT_SHEETS[key] ?? key;
  const baseName = (path?: string) => path?.split(/[\\/]/).pop();

  return {
    input,
    report,
    evidence: input.evidence ?? {},
    facts: { ...input.facts, calibration: input.facts?.calibration ?? [] },
    reference: input.reference,
    year: report.reportingYear,
    gwp: AR5_GWP_CH4,
    totalCo2e: report.totals.totalCo2eT,
    stream: (id) => report.sourceStreams.find((s) => s.id === id),
    sheet,
    reportRef: (key, locator, extra) => {
      const name = sheet(key);
      return { documentId: report.documentId, fileName: reportFile, sheet: name, locator: `Sheet ${name}, ${locator}`, ...extra };
    },
    referenceRef: (kind, locator, rows) => ({
      documentId: REFERENCE_DOCUMENT_IDS[kind],
      fileName: baseName(input.reference.sources[kind]) ?? REFERENCE_FILES[kind],
      locator,
      ...(rows ? { rows } : {}),
    }),
    plan: (topic) => input.facts?.monitoringPlan?.statements.find((s) => s.topic === topic),
    plans: (topic) => input.facts?.monitoringPlan?.statements.filter((s) => s.topic === topic) ?? [],
  };
}

export const csvRef = (src: { documentId: string; fileName: string }, locator: string, extra?: Partial<EvidenceRef>): EvidenceRef => ({
  documentId: src.documentId,
  fileName: src.fileName,
  locator,
  ...extra,
});

/** Share of the reported total, in %. */
export const pctOfTotal = (ctx: CheckContext, tco2e: number) => (ctx.totalCo2e > 0 ? (tco2e / ctx.totalCo2e) * 100 : 0);

// ---------------------------------------------------------------------------
// Source streams
// ---------------------------------------------------------------------------

export const isFlareStream = (s: SourceStream) => /flar/i.test(`${s.type} ${s.name}`);
/** Emission factor expressed per 10^3 Sm3 (flaring). */
export const isPerKSm3 = (unit: string) => /10\^?3\s*s?m3|1,?000\s*s?m3|ksm3/i.test(unit);

/** Recomputes CO2 from activity and factors using the unit-appropriate formula, or undefined when the units are not recognised. */
export function recomputeStreamCo2(s: SourceStream): { co2: number; energyTj?: number; formula: string } | undefined {
  const ox = typeof s.oxidationFactor === "number" ? s.oxidationFactor : 1;
  const efUnit = s.emissionFactorUnit ?? "";
  const ncvUnit = s.ncvUnit ?? "";
  if (isPerKSm3(efUnit)) return { co2: (s.activity / 1000) * s.emissionFactor, formula: "activity / 1000 x EF" };
  if (/\/\s*TJ/i.test(efUnit) && typeof s.ncv === "number") {
    if (/MJ\s*\/\s*S?m3/i.test(ncvUnit)) {
      const energyTj = s.activity * s.ncv * 1e-6;
      return { co2: energyTj * s.emissionFactor * ox, energyTj, formula: "activity x NCV x 10^-6 x EF x OF" };
    }
    if (/GJ\s*\/\s*t/i.test(ncvUnit)) {
      const energyTj = (s.activity * s.ncv) / 1000;
      return { co2: energyTj * s.emissionFactor * ox, energyTj, formula: "mass x NCV / 1000 x EF x OF" };
    }
  }
  if (/t\s*CO2\s*\/\s*t\b/i.test(efUnit)) return { co2: s.activity * s.emissionFactor * ox, formula: "mass x EF x OF" };
  return undefined;
}

// ---------------------------------------------------------------------------
// Flare log
// ---------------------------------------------------------------------------

export type FlareKey = "hp" | "lp";
export const dayVolume = (d: FlareLogDay, key: FlareKey) => (key === "hp" ? d.hpSm3 : d.lpSm3);
export const daySource = (d: FlareLogDay, key: FlareKey) => (key === "hp" ? d.hpSource : d.lpSource);

export interface FlareColumn {
  key: FlareKey;
  label: string;
  stream?: SourceStream;
}

/** Links the flare log HP/LP columns to source streams via the meter tag named in the data-source column. */
export function flareColumns(ctx: CheckContext): FlareColumn[] {
  const days = ctx.evidence.flareLog?.days ?? [];
  const flares = ctx.report.sourceStreams.filter(isFlareStream);
  return (["hp", "lp"] as const).map((key) => {
    const tags = new Set([...new Set(days.map((d) => daySource(d, key)))].flatMap(extractTags));
    const stream =
      flares.find((s) => s.meterTag && tags.has(s.meterTag)) ?? flares.find((s) => new RegExp(`\\b${key}\\b`, "i").test(s.name));
    return { key, label: `${key.toUpperCase()} flare${stream?.meterTag ? ` (${stream.meterTag})` : ""}`, stream };
  });
}

export const sortedDays = (ctx: CheckContext) => [...(ctx.evidence.flareLog?.days ?? [])].sort((a, b) => a.date.localeCompare(b.date));

// ---------------------------------------------------------------------------
// Estimated (non-metered) evidence periods
// ---------------------------------------------------------------------------

export interface EstimateUnit {
  start: IsoDate;
  end: IsoDate;
  value: number;
}

/** A continuous run of evidence rows whose data source is not a measurement. */
export interface EstimatePeriod {
  origin: "flare_log" | "fuel_meter";
  key?: FlareKey;
  stream?: SourceStream;
  meterTag?: string;
  /** Data source as written, e.g. "ENGINEERING ESTIMATE". */
  label: string;
  unit: "day" | "month";
  units: EstimateUnit[];
  start: IsoDate;
  end: IsoDate;
  volume: number;
  note?: string;
}

type OpenPeriod = Omit<EstimatePeriod, "start" | "end" | "volume">;

const closePeriod = (p: OpenPeriod): EstimatePeriod => ({
  ...p,
  start: p.units[0].start,
  end: p.units[p.units.length - 1].end,
  volume: sum(p.units.map((u) => u.value)),
});

export function estimatePeriods(ctx: CheckContext): EstimatePeriod[] {
  const periods: EstimatePeriod[] = [];
  const days = sortedDays(ctx);
  for (const col of flareColumns(ctx)) {
    let run: OpenPeriod | undefined;
    for (const d of days) {
      const source = daySource(d, col.key);
      const estimated = isEstimatedSource(source);
      if (run && (!estimated || daysBetween(run.units[run.units.length - 1].start, d.date) !== 1)) {
        periods.push(closePeriod(run));
        run = undefined;
      }
      if (!estimated) continue;
      run ??= { origin: "flare_log", key: col.key, stream: col.stream, meterTag: col.stream?.meterTag, label: source, unit: "day", units: [], note: d.note || undefined };
      run.units.push({ start: d.date, end: d.date, value: dayVolume(d, col.key) });
    }
    if (run) periods.push(closePeriod(run));
  }

  const months = [...(ctx.evidence.fuelMeter?.months ?? [])].sort((a, b) => `${a.meterTag}${a.month}`.localeCompare(`${b.meterTag}${b.month}`));
  let run: OpenPeriod | undefined;
  let last: { tag: string; month: string } | undefined;
  for (const m of months) {
    const estimated = isEstimatedSource(m.status);
    if (run && (!estimated || last?.tag !== m.meterTag || nextMonth(last.month) !== m.month)) {
      periods.push(closePeriod(run));
      run = undefined;
    }
    last = { tag: m.meterTag, month: m.month };
    if (!estimated) continue;
    const stream = ctx.report.sourceStreams.find((s) => s.meterTag === m.meterTag);
    run ??= { origin: "fuel_meter", stream, meterTag: m.meterTag, label: m.status, unit: "month", units: [], note: m.note || undefined };
    run.units.push({ start: `${m.month}-01`, end: monthEnd(m.month), value: m.volumeSm3 });
  }
  if (run) periods.push(closePeriod(run));
  return periods;
}

// ---------------------------------------------------------------------------
// Flare factors
// ---------------------------------------------------------------------------

export interface FlareFactors {
  /** t CO2 per 10^3 Sm3 flared. */
  co2PerKSm3?: number;
  /** t CH4 per 10^3 Sm3 flared (combustion slip). */
  ch4PerKSm3?: number;
  combustionEfficiency?: number;
  slipLine?: MethaneLine;
}

export function flareFactors(ctx: CheckContext): FlareFactors {
  const streams = ctx.report.sourceStreams.filter((s) => isFlareStream(s) && isPerKSm3(s.emissionFactorUnit));
  const activity = sum(streams.map((s) => s.activity));
  const efs = [...new Set(streams.map((s) => s.emissionFactor))];
  const co2PerKSm3 =
    efs.length === 1 ? efs[0] : activity > 0 ? (sum(streams.map((s) => s.co2T)) / activity) * 1000 : ctx.facts.gasAnalysis?.flareCo2FactorTPer1000Sm3;

  const slipLine = ctx.report.methane.find((l) => /flare/i.test(l.source) && (l.ch4T ?? 0) > 0);
  const basisFactor = slipLine?.basis.match(/([\d.]+)\s*t\s*CH4\s*\/\s*10\^?3\s*Sm3/i);
  const ch4PerKSm3 = basisFactor
    ? Number(basisFactor[1])
    : slipLine?.ch4T && activity > 0
      ? (slipLine.ch4T / activity) * 1000
      : ctx.facts.gasAnalysis?.flareCh4FactorTPer1000Sm3;

  const ceText = `${slipLine?.method ?? ""} ${streams.map((s) => String(s.oxidationFactor ?? "")).join(" ")}`;
  const ce = ceText.match(/(0\.\d+)\s*combustion efficiency/i) ?? ceText.match(/CE\s*(0\.\d+)/i);
  return { co2PerKSm3, ch4PerKSm3, combustionEfficiency: ce ? Number(ce[1]) : undefined, slipLine };
}

import type {
  CalibrationFact,
  CoverLetterFact,
  DeclarationFact,
  DocumentKind,
  EvidenceRef,
  GasAnalysisFact,
  GasSampleFact,
  LdarFact,
  LdarSurveyFact,
  MonitoringPlanFact,
  MonitoringPlanTopic,
  PlanStatementFact,
  VerificationFact,
  VerificationOpinion,
  VerifierFindingFact,
} from "@zerocarbon/shared";
import type { z } from "zod";
import type { ChatMessage, OpenRouterClient } from "../ai/openrouter.ts";
import { type KindFacts, compact, normalizeFindingStatus } from "./heuristics.ts";
import * as S from "./schemas.ts";
import { type DocText, collapse, dedupeRefs, evidenceRef, expandIds, locateQuote, parseDate, parseNum } from "./text.ts";

const MAX_DOC_CHARS = 60_000;

const SYSTEM = `You extract facts from PDF documents submitted with a facility greenhouse gas emissions report to the Environment Agency - Abu Dhabi (EAD) under UAE Federal Decree-Law No. 11 of 2024.
Rules:
- Use only the document text provided. Do not guess or infer: use null (or an empty list) when something is not stated.
- For every fact give "page" (the 1-based number from the "=== Page N ===" marker) and "quote": a short excerpt, at most 200 characters, copied verbatim from that page, that shows the value.
- Dates as YYYY-MM-DD. Numbers as plain numbers without units or thousands separators.`;

const TOPICS: MonitoringPlanTopic[] = [
  "methane_method",
  "tank_venting",
  "data_gap_procedure",
  "reconciliation_control",
  "emission_factor_method",
  "meter_calibration",
];
const CLAIMS: DeclarationFact["claim"][] = ["complete_and_accurate", "no_data_gaps", "verified"];

type Cited = { page: number | null; quote: string | null };

/** Validation state for one document's LLM output. */
class Merge {
  used = false;
  fallback = false;
  refs: EvidenceRef[] = [];

  constructor(
    readonly doc: DocText,
    readonly warnings: string[],
  ) {}

  warn(label: string, problem: string, hasFallback: boolean) {
    this.warnings.push(`${this.doc.document.fileName}: LLM ${label}: ${problem}; ${hasFallback ? "used the heuristic value" : "dropped"}`);
    if (hasFallback) this.fallback = true;
  }

  /** Evidence for a cited fact when its page exists and its quote is on that page, else the reason. */
  cite({ page, quote }: Cited): EvidenceRef | string {
    const p = this.doc.pages.find((x) => x.page === page);
    if (!p) return `page ${page ?? "(none)"} is out of range`;
    const found = quote ? locateQuote(p.text, quote) : undefined;
    return found ? evidenceRef(this.doc, p.page, found) : `quote not found on page ${page}`;
  }

  value<T>(label: string, c: S.Cited, parse: (v: string | number) => T | undefined, fallback: T | undefined): T | undefined {
    if (c.value === null || c.value === "") {
      if (fallback !== undefined) this.fallback = true;
      return fallback;
    }
    const v = parse(c.value);
    const ev = v === undefined ? `value "${c.value}" is not valid` : this.cite(c);
    if (typeof ev === "string") {
      this.warn(label, ev, fallback !== undefined);
      return fallback;
    }
    this.used = true;
    this.refs.push(ev);
    return v;
  }

  date(label: string, v: string | null, fallback: string | undefined): string | undefined {
    if (!v) return fallback;
    const d = parseDate(v);
    if (!d) this.warn(label, `date "${v}" is not valid`, fallback !== undefined);
    return d ?? fallback;
  }

  num(label: string, v: string | number | null, fallback: number | undefined): number | undefined {
    if (v === null || v === "") return fallback;
    const n = parseNum(v);
    if (n === undefined) this.warn(label, `number "${v}" is not valid`, fallback !== undefined);
    return n ?? fallback;
  }

  /**
   * Keyed list: verified LLM items are kept; for keys without a verified LLM item, the heuristic items are used
   * (covers both failed verification and items the LLM missed).
   */
  list<L extends Cited, F>(
    label: string,
    items: L[],
    key: (x: L) => string,
    heuristic: F[],
    heuristicKey: (f: F) => string,
    build: (x: L, evidence: EvidenceRef, h: F | undefined) => F,
  ): F[] {
    const out: F[] = [];
    const verified = new Set<string>();
    for (const x of items) {
      const k = key(x);
      const h = heuristic.find((f) => heuristicKey(f) === k);
      const ev = this.cite(x);
      if (typeof ev === "string") {
        this.warn(`${label} ${k}`, ev, h !== undefined);
        continue;
      }
      out.push(build(x, ev, h));
      verified.add(k);
      this.used = true;
      this.refs.push(ev);
    }
    const rest = heuristic.filter((f) => !verified.has(heuristicKey(f)));
    if (rest.length) this.fallback = true;
    return [...out, ...rest];
  }

  evidence(heuristic: EvidenceRef[] = []): EvidenceRef[] {
    return dedupeRefs([...this.refs, ...(this.fallback ? heuristic : [])]);
  }
}

const str = (v: string | number | null | undefined) => (v === null || v === undefined ? undefined : collapse(String(v)) || undefined);
const upperKey = (s: string) => collapse(s).toUpperCase().replace(/\s+/g, "");
const snake = (s: string) => s.toLowerCase().trim().replace(/[\s-]+/g, "_");

function normOpinion(v: string | number): VerificationOpinion | undefined {
  const s = String(v).toLowerCase();
  if (/adverse/.test(s)) return "adverse";
  if (/disclaim|no\s+opinion/.test(s)) return "disclaimer";
  if (/unqualified|unmodified|clean|positive/.test(s)) return "unmodified";
  if (/qualified|modified/.test(s)) return "qualified";
  return undefined;
}

const normTopic = (v: string): MonitoringPlanTopic => TOPICS.find((t) => t === snake(v)) ?? "other";
const normClaim = (v: string): DeclarationFact["claim"] => CLAIMS.find((c) => c === snake(v)) ?? "other";

function normStream(stream: string, point: string): GasSampleFact["stream"] {
  for (const s of [stream, point]) {
    if (/flare/i.test(s)) return "flare";
    if (/fuel/i.test(s)) return "fuel";
  }
  return "other";
}

function normResult(v: string | null): string | undefined {
  if (!v) return undefined;
  return /fail/i.test(v) ? "FAIL" : /pass/i.test(v) ? "PASS" : collapse(v) || undefined;
}

function mergeCalibration(mc: Merge, out: S.CalibrationOutput, heuristic: CalibrationFact[]): CalibrationFact[] {
  return mc.list("calibration certificate", out.certificates, (c) => upperKey(c.tag), heuristic, (f) => f.tag, (c, evidence, h) => {
    const tag = upperKey(c.tag);
    return compact<CalibrationFact>({
      tag,
      service: str(c.service) ?? h?.service,
      certificateNo: str(c.certificateNo) ?? h?.certificateNo,
      calibratedOn: mc.date(`${tag} calibratedOn`, c.calibratedOn, h?.calibratedOn),
      nextDue: mc.date(`${tag} nextDue`, c.nextDue, h?.nextDue),
      result: normResult(c.result) ?? h?.result,
      evidence,
    });
  });
}

function mergeGasAnalysis(mc: Merge, out: S.GasAnalysisOutput, h?: GasAnalysisFact): GasAnalysisFact {
  const samples = mc.list("gas sample", out.samples, (s) => upperKey(s.sampleId), h?.samples ?? [], (s) => upperKey(s.sampleId), (s, _ev, hs) =>
    compact<GasSampleFact>({
      sampleId: collapse(s.sampleId),
      samplingPoint: collapse(s.samplingPoint) || hs?.samplingPoint || "",
      stream: normStream(s.stream, s.samplingPoint),
      sampledOn: mc.date(`${s.sampleId} sampledOn`, s.sampledOn, hs?.sampledOn),
    }),
  );
  const fact = compact<GasAnalysisFact>({
    reportNo: mc.value("reportNo", out.reportNo, str, h?.reportNo),
    issuedOn: mc.value("issuedOn", out.issuedOn, parseDate, h?.issuedOn),
    samples,
    fuelEfMeanTco2PerTj: mc.value("fuelEfMeanTco2PerTj", out.fuelEfMeanTco2PerTj, parseNum, h?.fuelEfMeanTco2PerTj),
    fuelNcvMeanMjPerSm3: mc.value("fuelNcvMeanMjPerSm3", out.fuelNcvMeanMjPerSm3, parseNum, h?.fuelNcvMeanMjPerSm3),
    flareCo2FactorTPer1000Sm3: mc.value("flareCo2FactorTPer1000Sm3", out.flareCo2FactorTPer1000Sm3, parseNum, h?.flareCo2FactorTPer1000Sm3),
    flareCh4FactorTPer1000Sm3: mc.value("flareCh4FactorTPer1000Sm3", out.flareCh4FactorTPer1000Sm3, parseNum, h?.flareCh4FactorTPer1000Sm3),
    evidence: [],
  });
  fact.evidence = mc.evidence(h?.evidence);
  return fact;
}

function mergeVerification(mc: Merge, out: S.VerificationOutput, h?: VerificationFact): VerificationFact {
  const opinionOut = /^\s*unknown\s*$/i.test(String(out.opinion.value ?? "")) ? { ...out.opinion, value: null } : out.opinion;
  const opinion = mc.value("opinion", opinionOut, normOpinion, h?.opinion) ?? "unknown";
  let scopeExclusions = h?.scopeExclusions ?? [];
  const ids = expandIds(out.scopeExclusions.ids.join(", "), "[A-Z]{1,3}");
  if (ids.length) {
    const ev = mc.cite(out.scopeExclusions);
    if (typeof ev === "string") mc.warn("scopeExclusions", ev, scopeExclusions.length > 0);
    else {
      scopeExclusions = ids;
      mc.used = true;
      mc.refs.push(ev);
    }
  } else if (scopeExclusions.length) mc.fallback = true;
  const findings = mc.list("finding", out.findings, (f) => upperKey(f.id), h?.findings ?? [], (f) => f.id, (f, evidence, hf) =>
    compact<VerifierFindingFact>({
      id: upperKey(f.id),
      description: collapse(f.description) || hf?.description || "",
      status: normalizeFindingStatus("", f.status) || hf?.status || "unknown",
      impactTco2e: mc.num(`${f.id} impactTco2e`, f.impactTco2e, hf?.impactTco2e),
      evidence,
    }),
  );
  const fact = compact<VerificationFact>({
    reference: mc.value("reference", out.reference, str, h?.reference),
    date: mc.value("date", out.date, parseDate, h?.date),
    body: mc.value("body", out.body, str, h?.body),
    opinion,
    assuranceLevel: mc.value("assuranceLevel", out.assuranceLevel, str, h?.assuranceLevel),
    materialityPct: mc.value("materialityPct", out.materialityPct, parseNum, h?.materialityPct),
    scopeExclusions,
    findings,
    evidence: [],
  });
  fact.evidence = mc.evidence(h?.evidence);
  return fact;
}

function mergeMonitoringPlan(mc: Merge, out: S.MonitoringPlanOutput, h?: MonitoringPlanFact): MonitoringPlanFact {
  return compact<MonitoringPlanFact>({
    documentNo: mc.value("documentNo", out.documentNo, str, h?.documentNo),
    revision: mc.value("revision", out.revision, (v) => str(v)?.replace(/^rev(?:ision)?\.?\s*/i, ""), h?.revision),
    date: mc.value("date", out.date, parseDate, h?.date),
    statements: mc.list("statement", out.statements, (s) => normTopic(s.topic), h?.statements ?? [], (s) => s.topic, (s, evidence) =>
      compact<PlanStatementFact>({
        topic: normTopic(s.topic),
        section: str(s.section)?.replace(/^(?:section|§)\s*/i, ""),
        text: collapse(s.text) || evidence.quote || "",
        evidence,
      }),
    ),
  });
}

function mergeCoverLetter(mc: Merge, out: S.CoverLetterOutput, h?: CoverLetterFact): CoverLetterFact {
  return compact<CoverLetterFact>({
    reference: mc.value("reference", out.reference, str, h?.reference),
    date: mc.value("date", out.date, parseDate, h?.date),
    reportedTotalTco2e: mc.value("reportedTotalTco2e", out.reportedTotalTco2e, parseNum, h?.reportedTotalTco2e),
    declarations: mc.list("declaration", out.declarations, (d) => normClaim(d.claim), h?.declarations ?? [], (d) => d.claim, (d, evidence) => ({
      claim: normClaim(d.claim),
      text: collapse(d.text) || evidence.quote || "",
      evidence,
    })),
  });
}

function mergeLdar(mc: Merge, out: S.LdarOutput, h?: LdarFact): LdarFact {
  const surveys = mc.list("LDAR survey", out.surveys, (s) => upperKey(s.period), h?.surveys ?? [], (s) => upperKey(s.period), (s, _ev, hs) =>
    compact<LdarSurveyFact>({
      period: collapse(s.period),
      surveyedOn: mc.date(`${s.period} surveyedOn`, s.surveyedOn, hs?.surveyedOn),
      componentsSurveyed: mc.num(`${s.period} componentsSurveyed`, s.componentsSurveyed, hs?.componentsSurveyed),
      leaksFound: mc.num(`${s.period} leaksFound`, s.leaksFound, hs?.leaksFound),
      leaksRepaired: mc.num(`${s.period} leaksRepaired`, s.leaksRepaired, hs?.leaksRepaired),
      ch4T: mc.num(`${s.period} ch4T`, s.ch4T, hs?.ch4T),
    }),
  );
  const fact = compact<LdarFact>({
    contractor: mc.value("contractor", out.contractor, str, h?.contractor),
    surveys,
    annualCh4T: mc.value("annualCh4T", out.annualCh4T, parseNum, h?.annualCh4T),
    evidence: [],
  });
  fact.evidence = mc.evidence(h?.evidence);
  return fact;
}

type Runner = (client: OpenRouterClient, mc: Merge, heuristic: KindFacts) => Promise<{ facts: KindFacts; model: string }>;

function runner<T>(schema: z.ZodType<T>, schemaName: string, task: string, merge: (mc: Merge, out: T, heuristic: KindFacts) => KindFacts): Runner {
  return async (client, mc, heuristic) => {
    const res = await client.chatJson({ schema, schemaName, temperature: 0, maxTokens: 4096, messages: messages(mc.doc, task) });
    return { facts: merge(mc, res.data, heuristic), model: res.model };
  };
}

function messages(doc: DocText, task: string): ChatMessage[] {
  let body = doc.pages.map((p) => `=== Page ${p.page} ===\n${p.text}`).join("\n\n");
  if (body.length > MAX_DOC_CHARS) body = `${body.slice(0, MAX_DOC_CHARS)}\n[... truncated]`;
  return [
    { role: "system", content: SYSTEM },
    { role: "user", content: `Document: ${doc.document.fileName} (${doc.pages.length} pages)\n\nTask:\n${task}\n\nDocument text:\n${body}` },
  ];
}

const RUNNERS: Partial<Record<DocumentKind, Runner>> = {
  calibration_certificates: runner(
    S.calibrationSchema,
    "calibration_facts",
    "This file contains meter calibration certificates. Return one entry per certificate (one per instrument): tag (e.g. FT-3001), service (e.g. Fuel gas header), certificateNo, calibratedOn (date of calibration), nextDue (next calibration due date) and result (PASS or FAIL from the results table or conclusion). Use the page of that certificate and quote the calibration and next due dates.",
    (mc, out, h) => ({ calibration: mergeCalibration(mc, out, h.calibration ?? []) }),
  ),
  gas_analysis_certificate: runner(
    S.gasAnalysisSchema,
    "gas_analysis_facts",
    "This is a laboratory gas analysis certificate. Extract reportNo, issuedOn, every sample (sampleId, samplingPoint as written, stream: fuel for fuel gas points, flare for flare gas points, otherwise other; sampledOn) and the annual MEAN values stated for fuel gas: CO2 emission factor (t CO2/TJ) and net calorific value (MJ/Sm3). If flare gas factors are stated, give the mean t CO2 per 10^3 Sm3 flared and t CH4 per 10^3 Sm3. For table values, quote the table row.",
    (mc, out, h) => ({ gasAnalysis: mergeGasAnalysis(mc, out, h.gasAnalysis) }),
  ),
  verification_statement: runner(
    S.verificationSchema,
    "verification_facts",
    'This is an independent verification statement for an annual emissions report. Extract reference, date (date of statement), body (verification body name), opinion (unmodified, qualified, adverse or disclaimer, from the opinion section), assuranceLevel, materialityPct, scopeExclusions (ids of source streams or methane sources excluded from the verification scope or not covered by the statement; expand ranges such as "M-04 to M-08" into M-04, M-05, M-06, M-07, M-08; empty list if none) and every finding (id, description, status: unresolved if the finding is uncorrected or unresolved, resolved if corrected or closed, otherwise open; impactTco2e when an impact in t CO2 or t CO2e is stated).',
    (mc, out, h) => ({ verification: mergeVerification(mc, out, h.verification) }),
  ),
  monitoring_plan: runner(
    S.monitoringPlanSchema,
    "monitoring_plan_facts",
    "This is a greenhouse gas Monitoring Plan. Extract documentNo, revision (number only, e.g. 3.0), date of the revision, and statements (with section number and the relevant sentence as written) for these topics when the plan addresses them: methane_method (how methane sources other than combustion and flaring are quantified, or that the method is missing or under development); tank_venting (whether storage tanks vent to atmosphere, e.g. pressure/vacuum vents, or vapours are recovered); data_gap_procedure (how missing data are substituted and who is notified); reconciliation_control (reconciliation of meter totals against the gas balance and the deviation threshold); emission_factor_method (how the fuel gas emission factor is determined); meter_calibration (calibration interval of the flow meters).",
    (mc, out, h) => ({ monitoringPlan: mergeMonitoringPlan(mc, out, h.monitoringPlan) }),
  ),
  cover_letter: runner(
    S.coverLetterSchema,
    "cover_letter_facts",
    "This is the operator's cover letter for the annual emissions report. Extract reference (our ref), date, reportedTotalTco2e (total emissions in t CO2e) and the declarations made by the operator: complete_and_accurate (the report is complete and accurate), no_data_gaps (there were no data gaps), verified (the report has been verified), other (other statements about data gaps or completeness). text = the declaration sentence as written.",
    (mc, out, h) => ({ coverLetter: mergeCoverLetter(mc, out, h.coverLetter) }),
  ),
  ldar_survey: runner(
    S.ldarSchema,
    "ldar_facts",
    "This is a leak detection and repair (LDAR) survey summary. Extract contractor (survey company), one entry per survey (period label such as Q1, surveyedOn, componentsSurveyed, leaksFound, leaksRepaired, ch4T = estimated methane in tonnes) and annualCh4T (total estimated methane for the year, t).",
    (mc, out, h) => ({ ldar: mergeLdar(mc, out, h.ldar) }),
  ),
};

/** LLM extraction for one document, validated against the page text and merged over the heuristic facts. */
export async function llmFacts(
  doc: DocText,
  heuristic: KindFacts,
  client: OpenRouterClient,
  warnings: string[],
): Promise<{ facts: KindFacts; used: boolean; model: string }> {
  const run = RUNNERS[doc.document.kind];
  if (!run) return { facts: heuristic, used: false, model: client.model };
  const mc = new Merge(doc, warnings);
  const { facts, model } = await run(client, mc, heuristic);
  return { facts, used: mc.used, model: model || client.model };
}

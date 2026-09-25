/**
 * Shared contracts between the API and the web app.
 *
 * Sections:
 *   1. Basics
 *   2. Submission documents and evidence references
 *   3. Canonical emissions report (parsed from the EAD MRV workbook)
 *   4. Supporting evidence (CSV records)
 *   5. Facts extracted from PDF documents
 *   6. Regulator reference data (peers, prior year, satellite)
 *   7. Regulations corpus
 *   8. Checks, findings and reviews
 *   9. Officer decisions, letters, audit log
 *  10. API responses
 */

// ---------------------------------------------------------------------------
// 1. Basics
// ---------------------------------------------------------------------------

/** "demo": offline, no API key (templates or cached AI output). "live": OpenRouter. */
export type AiMode = "demo" | "live";

export type ReviewStatus = "compliant" | "needs_clarification" | "non_compliant";

export type Sector = "power" | "oil_and_gas" | "industry" | "transport";

/** ISO 8601 date, `YYYY-MM-DD`. */
export type IsoDate = string;
/** ISO 8601 timestamp. */
export type IsoDateTime = string;

export interface ApiError {
  error: string;
  details?: unknown;
}

// ---------------------------------------------------------------------------
// 2. Submission documents and evidence references
// ---------------------------------------------------------------------------

export type DocumentKind =
  | "emissions_report" // EAD MRV Excel workbook
  | "monitoring_plan"
  | "verification_statement"
  | "cover_letter"
  | "calibration_certificates"
  | "gas_analysis_certificate"
  | "ldar_survey"
  | "flare_log"
  | "fuel_meter_log"
  | "diesel_invoices"
  | "production_gas_balance"
  | "other";

export interface SubmissionDocument {
  /** Stable within a submission: slug of the file name, e.g. "dec-sdf-cpf2-flare-log-daily-2025". */
  id: string;
  fileName: string;
  /** Path relative to the submission folder, e.g. "evidence/DEC-SDF-CPF2_Flare-Log_Daily_2025.csv". */
  relativePath: string;
  kind: DocumentKind;
  mediaType: string;
  sizeBytes: number;
  sha256: string;
  pageCount?: number;
  rowCount?: number;
  sheetNames?: string[];
}

/**
 * Where a fact lives. Every finding and extracted fact must carry at least one,
 * so an officer can open the exact place in the submitted files.
 */
export interface EvidenceRef {
  documentId: string;
  fileName: string;
  /** Human-readable location, e.g. "Sheet D2_Calculation_Approach, row SS-01", "Page 2", "Rows 2025-06-01 to 2025-12-31". */
  locator: string;
  sheet?: string;
  /** 1-based page number (PDF). */
  page?: number;
  /** Row key or range (CSV/XLSX), e.g. "2025-06-01..2025-12-31" or "SS-01". */
  rows?: string;
  /** Short verbatim excerpt (<= 300 chars) supporting the claim. */
  quote?: string;
}

// ---------------------------------------------------------------------------
// 3. Canonical emissions report (EAD MRV workbook)
// ---------------------------------------------------------------------------

export type StreamCategory = "Major" | "Minor" | "De-minimis";

export interface SourceStream {
  /** "SS-01" */
  id: string;
  name: string;
  /** "Combustion" | "Flaring" | ... as written in the workbook. */
  type: string;
  category?: StreamCategory | string;
  /** Measuring instrument tag named for the activity data, e.g. "FT-5101". */
  meterTag?: string;
  measurement?: string;
  /** Activity data tier as declared, e.g. "Tier 2". */
  activityTier?: string;
  maxUncertainty?: string;
  /** e.g. "NCV and EF from quarterly GC analysis (site-specific, Tier 3)". */
  factorsBasis?: string;
  activity: number;
  activityUnit: string;
  ncv?: number;
  ncvUnit?: string;
  energyTj?: number;
  emissionFactor: number;
  emissionFactorUnit: string;
  /** Numeric oxidation factor, or the text written when it is embedded in the EF (e.g. "CE 0.98 in EF"). */
  oxidationFactor?: number | string;
  co2T: number;
  /** Tiers text from D2, e.g. "AD Tier 3 / NCV Tier 3 / EF Tier 3". */
  tiers?: string;
  dataSource?: string;
  evidence: EvidenceRef;
}

export interface MonthlyActivity {
  /** "2025-01" */
  month: string;
  /** Activity per source stream id, e.g. { "SS-01": 8127075, "SS-02": 2998349 }. */
  byStream: Record<string, number>;
}

export type MethaneLineStatus = "quantified" | "zero" | "not_applicable" | "not_quantified";

export interface MethaneLine {
  /** "M-04" */
  id: string;
  source: string;
  category: string;
  method: string;
  basis: string;
  ch4T: number | null;
  gwp: number | null;
  co2eT: number | null;
  note: string;
  status: MethaneLineStatus;
  evidence: EvidenceRef;
}

export interface TechnicalUnit {
  tag: string;
  description: string;
  capacity?: string;
  sourceStream?: string;
  inScope?: boolean;
  notes?: string;
}

export interface DeclaredDataGap {
  sourceStream: string;
  period: string;
  cause: string;
  substitutionMethod: string;
  impactTco2e?: number;
  evidence: EvidenceRef;
}

export interface InstrumentRecord {
  tag: string;
  service?: string;
  type?: string;
  tier?: string;
  lastCalibration?: IsoDate;
  nextDue?: IsoDate;
  certificate?: string;
  /** As declared, e.g. "In service". */
  status?: string;
  evidence: EvidenceRef;
}

export interface MitigationMeasure {
  id: string;
  measure: string;
  type?: string;
  status?: string;
  year?: number;
  reductionTco2ePerYear?: number | null;
  notes?: string;
}

export interface EmissionsReport {
  documentId: string;
  templateName?: string;
  operator: {
    name: string;
    nameAr?: string;
    licence?: string;
    address?: string;
  };
  facility: {
    name: string;
    /** EAD facility registration ID, e.g. "AD-OG-0417". */
    eadId: string;
    permit?: string;
    sector?: Sector;
    sectorText?: string;
    location?: string;
    emirate?: string;
    lat?: number;
    lon?: number;
    startYear?: number;
  };
  reportingYear: number;
  period: { start: IsoDate; end: IsoDate };
  monitoringPlan?: { reference?: string; revision?: string; date?: IsoDate };
  submittedOn?: IsoDate;
  contacts?: { ghgLead?: string; email?: string; phone?: string; facilityManager?: string };
  declaration?: { text: string; signedBy?: string; date?: IsoDate; evidence: EvidenceRef };
  summaryText?: string;
  technicalUnits: TechnicalUnit[];
  /** C2 (d) dynamic data, e.g. { "Gas flared (Sm3)": 25050372 }. */
  dynamicData: Record<string, number | string>;
  production?: {
    oilBbl?: number;
    gasExportedSm3?: number;
    gasExportedBoe?: number;
    mmboe: number;
  };
  approaches: { calculation: boolean; measurement: boolean; fallback: boolean; methane: boolean };
  sourceStreams: SourceStream[];
  monthly: MonthlyActivity[];
  dieselStock?: { openingT?: number; deliveriesT?: number; closingT?: number; consumptionT?: number };
  methane: MethaneLine[];
  totals: {
    co2T: number;
    ch4T: number;
    ch4Co2eT: number;
    totalCo2eT: number;
    gwpCh4: number;
    /** kg CO2e per boe, computed from totals and production when available. */
    intensityKgCo2ePerBoe?: number;
  };
  dataGaps: DeclaredDataGap[];
  /** True when H1 explicitly states that there were no data gaps. */
  dataGapsDeclaredNone: boolean;
  verification: {
    body?: string;
    reference?: string;
    date?: IsoDate;
    assurance?: string;
    /** As declared by the operator, e.g. "Verified (see enclosed statement)". */
    outcome?: string;
    siteVisit?: IsoDate;
    evidence?: EvidenceRef;
  };
  instruments: InstrumentRecord[];
  mitigation: MitigationMeasure[];
  /** Text of sheets that say "Not applicable" (E1, E2, F), keyed by sheet name. */
  notApplicableSheets: Record<string, string>;
  /** Parser warnings (missing sheets or fields). Never throw on a malformed workbook: record here. */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// 4. Supporting evidence (CSV records)
// ---------------------------------------------------------------------------

export interface FlareLogDay {
  date: IsoDate;
  hpSm3: number;
  hpSource: string;
  lpSm3: number;
  lpSource: string;
  pilotStatus: string;
  note: string;
}

export interface FuelMeterMonth {
  month: string;
  meterTag: string;
  volumeSm3: number;
  status: string;
  ncvMjPerSm3?: number;
  note: string;
}

export interface DieselInvoice {
  invoiceNo: string;
  date: IsoDate;
  supplier: string;
  product: string;
  litres: number;
  densityKgPerL?: number;
  massT: number;
  deliveredTo?: string;
}

export interface ProductionMonth {
  month: string;
  days: number;
  oilBbl: number;
  avgBopd?: number;
  gasProducedSm3: number;
  fuelGasSm3: number;
  gasExportedSm3: number;
  gasExportedBoe?: number;
  gasReinjectedSm3: number;
  flaredByBalanceSm3: number;
  note: string;
}

export interface EvidenceData {
  flareLog?: { documentId: string; fileName: string; days: FlareLogDay[] };
  fuelMeter?: { documentId: string; fileName: string; months: FuelMeterMonth[] };
  dieselInvoices?: { documentId: string; fileName: string; invoices: DieselInvoice[] };
  productionBalance?: { documentId: string; fileName: string; months: ProductionMonth[] };
}

// ---------------------------------------------------------------------------
// 5. Facts extracted from PDF documents
// ---------------------------------------------------------------------------

export interface CalibrationFact {
  tag: string;
  service?: string;
  certificateNo?: string;
  calibratedOn?: IsoDate;
  nextDue?: IsoDate;
  /** "PASS" | "FAIL" | other text as written. */
  result?: string;
  evidence: EvidenceRef;
}

export interface GasSampleFact {
  sampleId: string;
  samplingPoint: string;
  stream: "fuel" | "flare" | "other";
  sampledOn?: IsoDate;
}

export interface GasAnalysisFact {
  reportNo?: string;
  issuedOn?: IsoDate;
  samples: GasSampleFact[];
  /** Annual mean CO2 emission factor of fuel gas, t CO2/TJ (site-specific). */
  fuelEfMeanTco2PerTj?: number;
  /** Annual mean NCV of fuel gas, MJ/Sm3. */
  fuelNcvMeanMjPerSm3?: number;
  /** Flare gas CO2 factor, t CO2 per 10^3 Sm3 (including combustion efficiency), if stated. */
  flareCo2FactorTPer1000Sm3?: number;
  /** Flare gas CH4 slip factor, t CH4 per 10^3 Sm3, if stated. */
  flareCh4FactorTPer1000Sm3?: number;
  evidence: EvidenceRef[];
}

export type VerificationOpinion = "unmodified" | "qualified" | "adverse" | "disclaimer" | "unknown";

export interface VerifierFindingFact {
  /** "F-01" */
  id: string;
  description: string;
  /** "resolved" | "unresolved" | "open" | other text as written, normalised to lower case. */
  status: string;
  impactTco2e?: number;
  evidence: EvidenceRef;
}

export interface VerificationFact {
  reference?: string;
  date?: IsoDate;
  body?: string;
  opinion: VerificationOpinion;
  assuranceLevel?: string;
  materialityPct?: number;
  /** Item ids excluded from scope, e.g. ["M-04", "M-05", "M-06", "M-07", "M-08"]. */
  scopeExclusions: string[];
  findings: VerifierFindingFact[];
  evidence: EvidenceRef[];
}

export type MonitoringPlanTopic =
  | "methane_method"
  | "tank_venting"
  | "data_gap_procedure"
  | "reconciliation_control"
  | "emission_factor_method"
  | "meter_calibration"
  | "other";

export interface PlanStatementFact {
  topic: MonitoringPlanTopic;
  /** Section number as written, e.g. "6.3". */
  section?: string;
  text: string;
  evidence: EvidenceRef;
}

export interface MonitoringPlanFact {
  documentNo?: string;
  revision?: string;
  date?: IsoDate;
  statements: PlanStatementFact[];
}

export interface DeclarationFact {
  /** "no_data_gaps" | "complete_and_accurate" | "verified" | "other" */
  claim: "no_data_gaps" | "complete_and_accurate" | "verified" | "other";
  text: string;
  evidence: EvidenceRef;
}

export interface CoverLetterFact {
  reference?: string;
  date?: IsoDate;
  reportedTotalTco2e?: number;
  declarations: DeclarationFact[];
}

export interface LdarSurveyFact {
  period: string;
  surveyedOn?: IsoDate;
  componentsSurveyed?: number;
  leaksFound?: number;
  leaksRepaired?: number;
  ch4T?: number;
}

export interface LdarFact {
  contractor?: string;
  surveys: LdarSurveyFact[];
  annualCh4T?: number;
  evidence: EvidenceRef[];
}

export interface DocumentFacts {
  calibration: CalibrationFact[];
  gasAnalysis?: GasAnalysisFact;
  verification?: VerificationFact;
  monitoringPlan?: MonitoringPlanFact;
  coverLetter?: CoverLetterFact;
  ldar?: LdarFact;
  extractedBy: "heuristic" | "llm";
  model?: string;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// 6. Regulator reference data
// ---------------------------------------------------------------------------

export interface PeerBenchmark {
  eadId: string;
  operator: string;
  facility: string;
  emirate: string;
  lat: number;
  lon: number;
  reportingYear: number;
  productionMmboe: number;
  reportedTco2e: number;
  co2T: number;
  ch4T: number;
  intensityKgCo2ePerBoe: number;
  ch4IntensityTPerMmboe: number;
  flaredSm3PerBoe: number;
  methaneSourcesQuantified: number;
  verificationOpinion: string;
}

export interface PriorYearRecord {
  eadId: string;
  facility: string;
  reportingYear: number;
  /** "SS-01" | "SS-02/03" | "SS-04" | "CH4" | "TOTAL" */
  item: string;
  description: string;
  activity?: number;
  unit?: string;
  co2T?: number;
  ch4T?: number;
  tco2e?: number;
}

export interface SatelliteDetection {
  id: string;
  datetimeUtc: IsoDateTime;
  localTimeGst: string;
  /** Local (GST, UTC+4) calendar date of the overpass. */
  localDate: IsoDate;
  rateKgCh4PerH: number;
  uncertaintyKgPerH: number;
  confidence: string;
  windFromDeg: number;
  windSpeedMs: number;
  plumeLengthM: number;
  nearestFacilityId: string;
  nearestFacility: string;
  nearestEquipment: string;
  distanceToEquipmentM: number;
  lat: number;
  lon: number;
  instrument: string;
  note: string;
  simulated: boolean;
  /** GeoJSON Polygon coordinates ([lon, lat] rings), if available. */
  plumePolygon?: number[][][];
}

export interface FacilityPoint {
  eadId: string;
  name: string;
  operator?: string;
  lat: number;
  lon: number;
  equipment: { name: string; lat: number; lon: number }[];
}

export interface ReferenceData {
  peers: PeerBenchmark[];
  priorYear: PriorYearRecord[];
  detections: SatelliteDetection[];
  facilities: FacilityPoint[];
  sources: { peers?: string; priorYear?: string; satellite?: string };
}

// ---------------------------------------------------------------------------
// 7. Regulations corpus
// ---------------------------------------------------------------------------

/** Stable rule ids. Checks and AI output may only cite ids from the corpus. */
export type RuleId =
  | "DL11-2024-ART6-1"
  | "DL11-2024-ART15"
  | "DL11-2024-ART16"
  | "DL11-2024-ART17"
  | "DL11-2024-ART18"
  | "CR67-2024-REGISTRY"
  | "EAD-MRV-SCOPE"
  | "EAD-MRV-DEADLINE"
  | "EAD-TGD-MP-UPDATE"
  | "EAD-TGD-COMPLETENESS"
  | "EAD-TGD-DATA-GAPS"
  | "EAD-TGD-CATEGORIES"
  | "EAD-TGD-TIERS"
  | "EAD-TGD-FALLBACK"
  | "EAD-TGD-METHODS"
  | "EAD-TGD-VERIFICATION"
  | "EAD-TGD-CORRECTIONS"
  | "EAD-TGD-INSPECTION"
  | "IPCC-2006-DEFAULTS"
  | "IPCC-AR5-GWP";

export interface RegulationRule {
  id: RuleId | string;
  /** Short citation shown in the UI, e.g. "Decree-Law 11/2024, Art. 6(1)". */
  citation: string;
  title: string;
  titleAr?: string;
  /** Plain-language paraphrase (not the official text). */
  summary: string;
  summaryAr?: string;
  instrument: string;
  jurisdiction: "UAE federal" | "Abu Dhabi" | "International";
  sourceUrl: string;
  sourceTitle: string;
  /** "verified" when checked against the cited source; "secondary" when only secondary sources were found. */
  confidence: "verified" | "secondary";
  tags: string[];
}

// ---------------------------------------------------------------------------
// 8. Checks, findings and reviews
// ---------------------------------------------------------------------------

export type Severity = "critical" | "high" | "medium" | "low" | "info";

/** breach: a rule is broken. clarification: needs an answer from the operator. signal: supports investigation, not a breach. */
export type FindingOutcome = "breach" | "clarification" | "signal";

export type FindingCategory =
  | "completeness"
  | "deadline"
  | "calculation"
  | "evidence"
  | "data_gap"
  | "emission_factor"
  | "methane"
  | "benchmark"
  | "trend"
  | "satellite"
  | "verification"
  | "declaration";

export interface FindingImpact {
  /** Estimated emissions not reported (positive = under-reported), t CO2e. */
  tco2e: number;
  basis: string;
  /** Whether it counts towards the review's estimated under-reporting total (avoid double counting). */
  countsTowardTotal: boolean;
}

export interface Finding {
  /** Stable within a review, e.g. "F-01". */
  id: string;
  checkId: string;
  title: string;
  category: FindingCategory;
  severity: Severity;
  outcome: FindingOutcome;
  /** One or two sentences, with the key numbers. Deterministic (no AI). */
  summary: string;
  /** Bullet points with supporting facts. */
  details: string[];
  evidence: EvidenceRef[];
  ruleIds: string[];
  impact?: FindingImpact;
  /** Key numbers for the UI, e.g. { reportedSm3: 8680437, balanceSm3: 22976806 }. */
  metrics: Record<string, number | string>;
  /** Plain-language explanation for the officer (AI in live mode, template in demo mode). */
  explanation?: string;
}

export type CheckStatus = "pass" | "fail" | "warning" | "not_applicable" | "error";

export interface CheckRun {
  checkId: string;
  title: string;
  category: FindingCategory;
  status: CheckStatus;
  /** One line describing what was checked and the result, e.g. "4 source streams recalculated within 0.1%". */
  message: string;
  findingIds: string[];
}

export type RiskBand = "low" | "medium" | "high" | "critical";

export type DecisionAction = "approve" | "request_clarification" | "escalate_inspection" | "refer_penalty";

export interface RecommendedAction {
  primary: DecisionAction;
  alsoConsider: DecisionAction[];
  rationale: string;
  /** Deadline for the operator to respond, if applicable. */
  responseDays?: number;
  ruleIds: string[];
}

export interface ReviewMetrics {
  reportedTotalTco2e: number;
  co2T: number;
  ch4T: number;
  productionMmboe?: number;
  intensityKgCo2ePerBoe?: number;
  ch4IntensityTPerMmboe?: number;
  peerMedianIntensity?: number;
  peerMinIntensity?: number;
  peerMaxIntensity?: number;
  /** 0-100, share of peers with a lower intensity. */
  intensityPercentile?: number;
  priorYearTotalTco2e?: number;
  yoyTotalPct?: number;
  yoyProductionPct?: number;
  estimatedUnderReportingTco2e: number;
  estimatedUnderReportingPct: number;
  correctedTotalTco2e: number;
  correctedIntensityKgCo2ePerBoe?: number;
}

export interface PipelineStage {
  name: "ingest" | "extract" | "checks" | "score" | "narrative";
  status: "done" | "skipped" | "failed";
  durationMs: number;
  detail?: string;
}

/** Issue suggested by the LLM that the rules did not produce. Quotes are verified against the documents. */
export interface AiObservation {
  id: string;
  title: string;
  explanation: string;
  evidence: EvidenceRef[];
  ruleIds: string[];
  /** True when every quote was found verbatim (after whitespace normalisation) in the cited document. */
  quotesVerified: boolean;
}

export interface Review {
  id: string;
  submissionId: string;
  createdAt: IsoDateTime;
  durationMs: number;
  aiMode: AiMode;
  /** OpenRouter model used for AI steps (live mode). */
  model?: string;
  /** Where the narrative came from. */
  narrativeSource: "llm" | "cache" | "template";
  status: ReviewStatus;
  riskScore: number;
  riskBand: RiskBand;
  headline: string;
  summary: string;
  findings: Finding[];
  checks: CheckRun[];
  metrics: ReviewMetrics;
  recommendedAction: RecommendedAction;
  legalExposure?: { text: string; ruleIds: string[] };
  aiObservations: AiObservation[];
  facts: DocumentFacts;
  stages: PipelineStage[];
  /** Hash of the inputs; used to detect stale cached AI output. */
  inputHash: string;
}

// ---------------------------------------------------------------------------
// 9. Officer decisions, letters, audit log
// ---------------------------------------------------------------------------

export interface Decision {
  id: string;
  submissionId: string;
  reviewId: string;
  action: DecisionAction;
  officerName: string;
  note?: string;
  createdAt: IsoDateTime;
  letterId?: string;
}

export interface LetterContent {
  subject: string;
  /** Plain text with blank lines between paragraphs; numbered lists as "1. ..." lines. */
  body: string;
}

export interface Letter {
  id: string;
  submissionId: string;
  reviewId: string;
  action: DecisionAction;
  en: LetterContent;
  ar: LetterContent;
  /** Our reference, e.g. "EAD/MRV/2026/AD-OG-0417/Q1". */
  reference: string;
  generatedBy: "llm" | "cache" | "template";
  model?: string;
  status: "draft" | "approved";
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  approvedBy?: string;
  approvedAt?: IsoDateTime;
}

export type AuditEventType =
  | "submission_received"
  | "review_started"
  | "review_completed"
  | "review_failed"
  | "decision_recorded"
  | "letter_drafted"
  | "letter_updated"
  | "letter_approved"
  | "demo_reset";

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  submissionId?: string;
  actor: string;
  message: string;
  createdAt: IsoDateTime;
}

// ---------------------------------------------------------------------------
// 10. API responses
// ---------------------------------------------------------------------------

export interface HealthResponse {
  ok: true;
  service: "zerocarbon-api";
  version: string;
  aiMode: AiMode;
  model?: string;
  submissionCount: number;
  time: IsoDateTime;
}

export type SubmissionSource = "demo" | "upload";

export type SubmissionStage = "not_reviewed" | "reviewing" | "reviewed" | "decided" | "failed";

/** One row of the officer inbox. */
export interface SubmissionSummary {
  id: string;
  source: SubmissionSource;
  facilityName: string;
  facilityShortName: string;
  operator: string;
  eadId: string;
  emirate?: string;
  sector?: Sector;
  reportingYear: number;
  submittedOn?: IsoDate;
  reportedTotalTco2e?: number;
  documentCount: number;
  lat?: number;
  lon?: number;
  stage: SubmissionStage;
  status?: ReviewStatus;
  riskScore?: number;
  riskBand?: RiskBand;
  findingCount?: number;
  estimatedUnderReportingTco2e?: number;
  decision?: DecisionAction;
  reviewedAt?: IsoDateTime;
}

export interface SubmissionDetail extends SubmissionSummary {
  documents: SubmissionDocument[];
  report?: EmissionsReport;
  /** Parsed CSV evidence (flare log, fuel meter, diesel invoices, production balance), for charts. */
  evidence?: EvidenceData;
  review?: Review;
  decisions: Decision[];
  letters: Letter[];
}

export interface DocumentTextResponse {
  documentId: string;
  fileName: string;
  kind: DocumentKind;
  /** PDF: one entry per page. CSV/XLSX: a single entry with a text rendering. */
  pages: { page: number; text: string }[];
}

export interface ReviewAllResponse {
  reviewed: number;
  failed: number;
  durationMs: number;
  results: { submissionId: string; status?: ReviewStatus; riskScore?: number; durationMs: number; error?: string }[];
}

export interface DashboardResponse {
  reportingYear: number;
  submissions: number;
  reviewed: number;
  byStatus: Record<ReviewStatus, number>;
  byStage: Record<SubmissionStage, number>;
  totalReportedTco2e: number;
  estimatedUnderReportingTco2e: number;
  averageReviewMs?: number;
  decisions: Record<DecisionAction, number>;
  topRisks: SubmissionSummary[];
  aiMode: AiMode;
}

export type MapFeatureKind = "submission" | "peer" | "detection" | "plume";

/** GET /api/map: GeoJSON FeatureCollection with coordinates as [lon, lat]. */
export interface MapFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] } | { type: "Polygon"; coordinates: number[][][] };
  properties: { kind: MapFeatureKind; [key: string]: unknown };
}

export interface MapResponse {
  type: "FeatureCollection";
  features: MapFeature[];
}

export interface AskRequest {
  question: string;
}

export interface AskResponse {
  answer: string;
  citations: EvidenceRef[];
  ruleIds: string[];
  source: "llm" | "offline";
  model?: string;
}

export interface DecisionRequest {
  action: DecisionAction;
  officerName: string;
  note?: string;
  /** Draft a letter for this decision (default true, except for approve where it is still allowed). */
  draftLetter?: boolean;
}

export interface DecisionResponse {
  decision: Decision;
  letter?: Letter;
}

export interface LetterDraftRequest {
  action: DecisionAction;
}

export interface LetterUpdateRequest {
  en?: LetterContent;
  ar?: LetterContent;
  status?: "draft" | "approved";
  officerName?: string;
}

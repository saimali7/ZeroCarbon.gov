/** Synthetic reviews for the AI writer tests, mirroring demo/ANSWER-KEY.md (Southern Dunes CPF-2 and Eastern Dunes CPF-1). */
import type { CheckRun, EmissionsReport, EvidenceRef, Finding, RegulationRule, Review, ReviewMetrics, SubmissionDocument } from "@zerocarbon/shared";
import type { OpenRouterClient } from "../../src/ai/openrouter.ts";
import type { LetterInput, NarrativeInput, SubmissionIdentity, SubmissionPackage } from "../../src/types.ts";

const rule = (id: string, citation: string, title: string, summary: string, jurisdiction: RegulationRule["jurisdiction"] = "Abu Dhabi"): RegulationRule => ({
  id,
  citation,
  title,
  summary,
  instrument: jurisdiction === "UAE federal" ? "Federal Decree-Law No. 11 of 2024" : "EAD Technical Guidance for MRV v5",
  jurisdiction,
  sourceUrl: jurisdiction === "UAE federal" ? "https://uaelegislation.gov.ae/en/legislations/2558" : "https://facilitymrv.ead.ae/",
  sourceTitle: jurisdiction === "UAE federal" ? "UAE Legislation" : "EAD Facility MRV",
  confidence: "secondary",
  tags: [],
});

/** Citations copied from apps/api/data/regulations.json (the corpus of record). */
export const RULES: RegulationRule[] = [
  rule("DL11-2024-ART6-1", "Decree-Law 11/2024, Art. 6(1)", "Measurement, reporting and record-keeping duties", "Designated sources must measure and report their emissions and keep records for five years.", "UAE federal"),
  rule(
    "DL11-2024-ART15",
    "Decree-Law 11/2024, Art. 15",
    "Fines for breaching the Article 6(1) MRV obligations",
    "A breach of Article 6(1) is punishable by a fine of AED 50,000 to AED 2,000,000, imposed through the courts.",
    "UAE federal",
  ),
  rule(
    "DL11-2024-ART16",
    "Decree-Law 11/2024, Art. 16",
    "Repeat offence: penalties doubled",
    "Penalties are doubled if the same act is repeated within two years of a previous final judgment of conviction.",
    "UAE federal",
  ),
  rule("EAD-TGD-COMPLETENESS", "EAD TGD, s. 5 (Operators) and Step 3(a)", "Completeness, consistency, transparency and accuracy", "Monitoring and reporting must cover all emissions."),
  rule("EAD-TGD-CATEGORIES", "EAD TGD, App. 1.3 Step 3; template sheets 3d1 and 3e1", "Source stream categories", "A de minimis claim should rest on a quantified estimate."),
  rule(
    "EAD-TGD-DATA-GAPS",
    "EAD TGD, Steps 3(a) and 3(c), App. 1.3 Step 7; template sheet 4h (H1)",
    "Data gaps and deviations must be prevented and reported",
    "Every data gap must be declared in sheet H1 with the method used to fill it.",
  ),
  rule("EAD-TGD-MP-UPDATE", "EAD TGD, Step 2 and App. 1.4", "Monitoring plan revision", "The plan must be revised within 30 days of significant changes."),
  rule("EAD-TGD-METHODS", "EAD TGD, Step 2(b), App. 1.2 and FAQ Q7", "Monitoring methodologies and emission factors", "Local emission factors are preferred; IPCC defaults are the fallback."),
  rule("EAD-TGD-VERIFICATION", "EAD TGD, s. 5, Steps 4 and 5; FAQ Q13", "Verification (voluntary until 2027)", "Third-party verification is voluntary until 2027."),
  rule("EAD-TGD-CORRECTIONS", "EAD TGD, Step 5", "Correction of errors within 30 days", "Errors must be corrected within 30 days of discovery."),
  rule(
    "EAD-TGD-INSPECTION",
    "Decree-Law 11/2024, Arts. 6(1)(c), 6(3) and 14; EAD TGD, Step 6",
    "Regulator access to records, data verification and enforcement",
    "EAD may verify data, access records and issue written notices with corrective actions and deadlines.",
  ),
];

// ---------------------------------------------------------------------------
// Southern Dunes CPF-2 (non-compliant)
// ---------------------------------------------------------------------------

const doc = (id: string, fileName: string, kind: SubmissionDocument["kind"], pageCount?: number): SubmissionDocument => ({
  id,
  fileName,
  relativePath: fileName.endsWith(".csv") || fileName.includes("Certificate") ? `evidence/${fileName}` : fileName,
  kind,
  mediaType: fileName.endsWith(".pdf") ? "application/pdf" : fileName.endsWith(".csv") ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  sizeBytes: 50_000,
  sha256: `sha-${id}`,
  ...(pageCount ? { pageCount } : {}),
});

export const SOUTH_DOCS = {
  report: doc("ead-mrv-emissions-report-ry2025", "DEC-SDF-CPF2_EAD-MRV-Emissions-Report_RY2025.xlsx", "emissions_report"),
  plan: doc("monitoring-plan-rev3-0", "DEC-SDF-CPF2_Monitoring-Plan_Rev3.0.pdf", "monitoring_plan", 4),
  verification: doc("verification-statement-ry2025", "DEC-SDF-CPF2_Verification-Statement_RY2025.pdf", "verification_statement", 2),
  cover: doc("cover-letter-ry2025", "DEC-SDF-CPF2_Cover-Letter_RY2025.pdf", "cover_letter", 1),
  flareLog: doc("flare-log-daily-2025", "DEC-SDF-CPF2_Flare-Log_Daily_2025.csv", "flare_log"),
  gasBalance: doc("production-and-gas-balance-monthly-2025", "DEC-SDF-CPF2_Production-and-Gas-Balance_Monthly_2025.csv", "production_gas_balance"),
  gasAnalysis: doc("gas-analysis-certificate-2025", "DEC-SDF-CPF2_Gas-Analysis-Certificate_2025.pdf", "gas_analysis_certificate", 2),
  calibration: doc("meter-calibration-certificates", "DEC-SDF-CPF2_Meter-Calibration-Certificates.pdf", "calibration_certificates", 3),
};

const ev = (d: SubmissionDocument, locator: string, extra: Partial<EvidenceRef> = {}): EvidenceRef => ({ documentId: d.id, fileName: d.fileName, locator, ...extra });
const reference = (documentId: string, fileName: string, locator: string): EvidenceRef => ({ documentId, fileName, locator });

export const SOUTH_IDENTITY: SubmissionIdentity = {
  submissionId: "DEC_Southern-Dunes-CPF2_RY2025",
  facilityName: "Southern Dunes Field Central Processing Facility 2 (CPF-2)",
  facilityShortName: "Southern Dunes CPF-2",
  operator: "Dunes Energy Company",
  operatorAr: "شركة الكثبان للطاقة",
  eadId: "AD-OG-0417",
  permit: "EP-2020-01873",
  reportingYear: 2025,
  submittedOn: "2026-03-30",
  contactName: "Hind Al Shamsi",
};

const D = SOUTH_DOCS;
export const SOUTH_FINDINGS: Finding[] = [
  {
    id: "F-01",
    checkId: "methane-completeness",
    title: "Methane sources M-04 to M-08 not quantified",
    category: "methane",
    severity: "critical",
    outcome: "breach",
    summary:
      "Sheet G reports methane only for flare slip and combustion (M-01 to M-03), while tanks, the TEG still vent, pneumatics, compressor seals and fugitives (M-04 to M-08) are marked not applicable or de minimis without any estimate. The Monitoring Plan (section 6.3) says the method is still under development.",
    details: [
      "C2 describes pressure/vacuum vents on tanks T-401A/B and Figure 1 shows P/V vents to atmosphere.",
      "Estimate: 16.1 t CH4/MMboe (Eastern Dunes non-flare intensity) x 25.82 MMboe = 416 t CH4.",
    ],
    evidence: [
      ev(D.report, "Sheet G_Methane, rows M-04 to M-08", { sheet: "G_Methane", rows: "M-04..M-08" }),
      ev(D.plan, "Page 3, section 6.3", { page: 3, quote: "A quantification methodology for these sources is under development" }),
    ],
    ruleIds: ["EAD-TGD-COMPLETENESS", "EAD-TGD-CATEGORIES", "DL11-2024-ART6-1"],
    impact: { tco2e: 11648, basis: "16.1 t CH4/MMboe x 25.82 MMboe x GWP 28", countsTowardTotal: true },
    metrics: { linesNotQuantified: 5, estimatedCh4T: 416, estimatedTco2e: 11648 },
  },
  {
    id: "F-02",
    checkId: "undeclared-data-gap",
    title: "Undeclared data gap at HP flare meter FT-5101",
    category: "data_gap",
    severity: "high",
    outcome: "breach",
    summary:
      "FT-5101 calibration expired on 31 May 2025 and from 1 June 2025 the flare log records ENGINEERING ESTIMATE values (6,752,500 Sm3, 31% of SS-02), yet sheet H1 declares no data gaps and sheet I lists the meter as in service.",
    details: ["Estimated days average 31,554 Sm3/d against 99,324 Sm3/d metered (68.2% lower)."],
    evidence: [
      ev(D.flareLog, "Rows 2025-06-01 to 2025-12-31, column hp_data_source", { rows: "2025-06-01..2025-12-31" }),
      ev(D.calibration, "Page 2", { page: 2, quote: "Next calibration due 31 May 2025" }),
      ev(D.report, "Sheet H1_Data_Gaps", { sheet: "H1_Data_Gaps" }),
    ],
    ruleIds: ["EAD-TGD-DATA-GAPS", "EAD-TGD-MP-UPDATE"],
    metrics: { estimatedSm3: 6752500, shareOfStreamPct: 31, meteredAvgSm3PerDay: 99324, estimatedAvgSm3PerDay: 31554 },
  },
  {
    id: "F-03",
    checkId: "flare-gas-balance",
    title: "Flare volumes contradict the company's own gas balance",
    category: "evidence",
    severity: "critical",
    outcome: "breach",
    summary: "From June to December the reported flare volume is 62.2% below the production gas balance (8,680,437 vs 22,976,806 Sm3), while January to May agree within 0.4%.",
    details: ["Gap 14,296,369 Sm3 = 35,283 t CO2 + 148.7 t CH4."],
    evidence: [
      ev(D.gasBalance, "Column flared_by_balance_sm3, rows 2025-06 to 2025-12", { rows: "2025-06..2025-12" }),
      ev(D.report, "Sheet D2_Calculation_Approach, monthly SS-02", { sheet: "D2_Calculation_Approach" }),
    ],
    ruleIds: ["EAD-TGD-COMPLETENESS", "DL11-2024-ART6-1"],
    impact: { tco2e: 39447, basis: "14,296,369 Sm3 at the flare gas factors", countsTowardTotal: true },
    metrics: { reportedSm3: 8680437, balanceSm3: 22976806, gapSm3: 14296369, gapPct: 62.2 },
  },
  {
    id: "F-04",
    checkId: "fuel-gas-ef",
    title: "Fuel gas emission factor does not match the laboratory certificate",
    category: "emission_factor",
    severity: "medium",
    outcome: "breach",
    summary:
      "Sheet D2 applies the IPCC default of 56.1 t CO2/TJ to SS-01 but labels it site-specific Tier 3; the gas analysis certificate gives a mean of 56.96 t CO2/TJ, an understatement of 3,084 t CO2 (1.1%).",
    details: ["Also raised by the verifier as finding F-01 (open)."],
    evidence: [
      ev(D.report, "Sheet D2_Calculation_Approach, row SS-01", { sheet: "D2_Calculation_Approach", rows: "SS-01" }),
      ev(D.gasAnalysis, "Page 2", { page: 2, quote: "CO2 emission factor (t CO2/TJ) 56.99 56.96 57.00 56.89 56.96" }),
    ],
    ruleIds: ["EAD-TGD-METHODS", "EAD-TGD-COMPLETENESS"],
    impact: { tco2e: 3084, basis: "SS-01 energy x (56.96 - 56.1) t CO2/TJ", countsTowardTotal: true },
    metrics: { reportedEf: 56.1, certificateEf: 56.96 },
  },
  {
    id: "F-05",
    checkId: "peer-benchmark",
    title: "Lowest emissions intensity in the peer group",
    category: "benchmark",
    severity: "medium",
    outcome: "signal",
    summary:
      "Reported intensity is 10.65 kg CO2e/boe against a peer median of 13.4 kg CO2e/boe (range 11.9 to 16.2), and methane intensity is 10.2 t CH4/MMboe against a peer range of 26.3 to 52.4. Year on year the total fell 9.0% while production rose 2.5%.",
    details: [],
    evidence: [reference("peer-benchmarks-ry2025", "peer-benchmarks_onshore-oil-CPF_RY2025.csv", "Onshore oil CPF peer set")],
    ruleIds: [],
    metrics: { intensity: 10.65, peerMedian: 13.4 },
  },
  {
    id: "F-06",
    checkId: "satellite-methane",
    title: "Satellite methane signals near CPF-2 (simulated)",
    category: "satellite",
    severity: "high",
    outcome: "signal",
    summary:
      "Three simulated detections: 14 Jul 2025, 1,820 kg/h at HP flare FL-501 during a logged pilot flame-out (12:05 to 18:35); 2 Aug 2025, 940 kg/h during the K-201B compressor trip; 19 Oct 2025, 710 kg/h at tank farm T-401A/B with no logged event.",
    details: [],
    evidence: [
      reference("satellite-methane-detections-2025", "satellite-methane-detections_2025_SIMULATED.geojson", "Detections 2025-07-14, 2025-08-02 and 2025-10-19"),
      ev(D.flareLog, "Rows 2025-07-14 and 2025-08-02", { rows: "2025-07-14,2025-08-02" }),
    ],
    ruleIds: ["EAD-TGD-INSPECTION"],
    metrics: { detections: 3, maxRateKgPerH: 1820 },
  },
  {
    id: "F-07",
    checkId: "verification-declaration",
    title: "Declarations contradict the qualified verification statement",
    category: "verification",
    severity: "high",
    outcome: "breach",
    summary:
      'The verification statement gives a qualified opinion (verifier finding F-03 unresolved) and excludes M-04 to M-08 from scope, yet sheet H1 says "Verified (see enclosed statement)" and the cover letter declares the report complete and accurate with no data gaps.',
    details: [],
    evidence: [
      ev(D.verification, "Page 2, sections 4 and 5", { page: 2, quote: "Qualified opinion." }),
      ev(D.cover, "Page 1", { page: 1, quote: "No data gaps occurred during the reporting period." }),
      ev(D.report, "Sheet H1_Data_Gaps", { sheet: "H1_Data_Gaps" }),
    ],
    ruleIds: ["EAD-TGD-VERIFICATION", "DL11-2024-ART6-1"],
    metrics: { opinion: "qualified" },
  },
];

const check = (checkId: string, title: string, category: CheckRun["category"], status: CheckRun["status"], message: string, findingIds: string[] = []): CheckRun => ({
  checkId,
  title,
  category,
  status,
  message,
  findingIds,
});

export const SOUTH_CHECKS: CheckRun[] = [
  check("completeness", "Report completeness", "completeness", "pass", "All required sheets A to K present."),
  check("deadline", "Submission deadline", "deadline", "pass", "Submitted on 30 March 2026, before the 31 March deadline."),
  check("recalculation", "Recalculation", "calculation", "pass", "4 source streams recalculated within 0.1%."),
  check("methane-completeness", "Methane sources", "methane", "fail", "5 of 8 methane lines not quantified.", ["F-01"]),
  check("undeclared-data-gap", "Data gaps", "data_gap", "fail", "Estimated flare values from 2025-06-01 with no declared gap.", ["F-02"]),
  check("flare-gas-balance", "Flare vs gas balance", "evidence", "fail", "Jun to Dec flare 62.2% below the gas balance.", ["F-03"]),
  check("fuel-gas-ef", "Fuel gas emission factor", "emission_factor", "fail", "Default EF used where site-specific is declared.", ["F-04"]),
  check("peer-benchmark", "Peer benchmark", "benchmark", "warning", "Lowest intensity of 9 facilities.", ["F-05"]),
  check("satellite-methane", "Satellite signals", "satellite", "warning", "3 detections near the facility.", ["F-06"]),
  check("verification-declaration", "Verification and declarations", "verification", "fail", "Qualified opinion, declarations say verified.", ["F-07"]),
];

export const SOUTH_METRICS: ReviewMetrics = {
  reportedTotalTco2e: 274896,
  co2T: 267496,
  ch4T: 264.3,
  productionMmboe: 25.82,
  intensityKgCo2ePerBoe: 10.65,
  ch4IntensityTPerMmboe: 10.2,
  peerMedianIntensity: 13.4,
  peerMinIntensity: 11.9,
  peerMaxIntensity: 16.2,
  intensityPercentile: 0,
  priorYearTotalTco2e: 302003,
  yoyTotalPct: -9.0,
  yoyProductionPct: 2.5,
  estimatedUnderReportingTco2e: 54179,
  estimatedUnderReportingPct: 19.7,
  correctedTotalTco2e: 329075,
  correctedIntensityKgCo2ePerBoe: 12.74,
};

const baseReview = (over: Partial<Review>): Review => ({
  id: "review",
  submissionId: "submission",
  createdAt: "2026-04-02T08:00:00.000Z",
  durationMs: 1200,
  aiMode: "demo",
  narrativeSource: "template",
  status: "compliant",
  riskScore: 0,
  riskBand: "low",
  headline: "",
  summary: "",
  findings: [],
  checks: [],
  metrics: SOUTH_METRICS,
  recommendedAction: { primary: "approve", alsoConsider: [], rationale: "", ruleIds: [] },
  aiObservations: [],
  facts: { calibration: [], extractedBy: "heuristic", warnings: [] },
  stages: [],
  inputHash: "hash",
  ...over,
});

export const SOUTH_REVIEW: Review = baseReview({
  id: "rev-south",
  submissionId: SOUTH_IDENTITY.submissionId,
  status: "non_compliant",
  riskScore: 88,
  riskBand: "critical",
  findings: SOUTH_FINDINGS,
  checks: SOUTH_CHECKS,
  metrics: SOUTH_METRICS,
  recommendedAction: {
    primary: "request_clarification",
    alsoConsider: ["escalate_inspection"],
    rationale: "Four breaches with an estimated 54,179 t CO2e (19.7%) unreported; errors must be corrected within 30 days. Satellite signals support a site inspection.",
    responseDays: 30,
    ruleIds: ["EAD-TGD-CORRECTIONS", "DL11-2024-ART6-1", "EAD-TGD-INSPECTION"],
  },
  legalExposure: {
    text: "If not remedied, the operator may be exposed to court-imposed fines of AED 50,000 to 2,000,000 for breaching Art. 6(1) (Art. 15), doubled if the same act is repeated within two years of a previous final conviction (Art. 16).",
    ruleIds: ["DL11-2024-ART15", "DL11-2024-ART16"],
  },
  inputHash: "south0417hash",
});

const page = (n: number, text: string) => ({ page: n, text });
export const SOUTH_PDF_TEXT: SubmissionPackage["pdfText"] = {
  [D.plan.id]: [
    page(1, "GREENHOUSE GAS MONITORING PLAN\nSouthern Dunes Field Central Processing Facility 2 (CPF-2)\nDocument number DEC-SDF-CPF2-HSE-MP-001\nRevision / date Rev 3.0 · 27 March 2025"),
    page(2, "3. Site schematic\nStorage tanks T-401A/B\nHP flare FL-501 SS-02\nFT FT-5101\nP/V vents to atmosphere\nFigure 1: Emission sources, source streams and measurement points at Southern Dunes CPF-2."),
    page(
      3,
      "6.3 Other methane sources\nCrude storage tanks T-401A/B, the TEG dehydration unit still vent (U-250), gas-driven pneumatic controllers, compressor\nseals (K-201A/B) and fugitive components have been identified as potential methane sources. A quantification\nmethodology for these sources is under development and will be included in the next revision of this Monitoring Plan\n(target: Q4 2025). A leak detection and repair (LDAR) programme is planned for 2026.",
    ),
    page(
      4,
      "8.2 Control activities\nMonthly reconciliation of flare meter totals against the gas balance in the production allocation report. Deviations\ngreater than 10% are investigated and documented.\n8.3 Data gaps and substitution\nWhere a meter is unavailable, missing data are substituted with the average of the 30 days of valid data preceding the gap.\nGaps are recorded in sheet H1 of the emissions report and notified to the Agency within 30 days.",
    ),
  ],
  [D.verification.id]: [
    page(1, "INDEPENDENT VERIFICATION STATEMENT\nStatement reference KVS-25-117\nLevel of assurance / materiality Reasonable assurance / 5% of total reported emissions"),
    page(
      2,
      "F-03 Non-conformity, unresolved SS-02: the calibration of HP flare meter FT-5101 expired on 31 May 2025 and\nthe meter was removed on 1 June 2025 and not reinstated during the reporting period.\n5. Opinion\nQualified opinion. Based on the procedures performed and the evidence obtained, except for the possible effects of the\nmatter described in finding F-03.",
    ),
  ],
  [D.cover.id]: [
    page(
      1,
      "Declaration. We confirm that the enclosed report is complete and accurate, has been prepared in accordance with the\napproved Monitoring Plan (Rev 3.0). No data gaps occurred during the reporting period.",
    ),
  ],
  [D.calibration.id]: [
    page(1, "CERTIFICATE OF CALIBRATION\nFT-3001: Fuel gas header\nNext calibration due 31 January 2026"),
    page(2, "CERTIFICATE OF CALIBRATION\nFT-5101: HP flare header\nDate of calibration 28 May 2024\nNext calibration due 31 May 2025"),
    page(3, "CERTIFICATE OF CALIBRATION\nFT-5102: LP flare header\nNext calibration due 28 February 2026"),
  ],
  [D.gasAnalysis.id]: [
    page(1, "CERTIFICATE OF ANALYSIS\nReport number SAL-25-GC-0417\nSamples SP-3001 fuel gas header 12-Feb-2025"),
    page(2, "Net calorific value (MJ/Sm3) 36.35 36.33 36.45 36.28 36.35\nCO2 emission factor (t CO2/TJ) 56.99 56.96 57.00 56.89 56.96"),
  ],
};

export const SOUTH_REPORT = {
  documentId: D.report.id,
  operator: { name: "Dunes Energy Company", nameAr: "شركة الكثبان للطاقة" },
  facility: { name: SOUTH_IDENTITY.facilityName, eadId: "AD-OG-0417", sector: "oil_and_gas" },
  reportingYear: 2025,
  period: { start: "2025-01-01", end: "2025-12-31" },
  submittedOn: "2026-03-30",
  technicalUnits: [],
  dynamicData: { "Gas flared (Sm3)": 25050372 },
  production: { mmboe: 25.82 },
  approaches: { calculation: true, measurement: false, fallback: false, methane: true },
  sourceStreams: [],
  monthly: [],
  methane: [],
  totals: { co2T: 267496, ch4T: 264.3, ch4Co2eT: 7400, totalCo2eT: 274896, gwpCh4: 28, intensityKgCo2ePerBoe: 10.65 },
  dataGaps: [],
  dataGapsDeclaredNone: true,
  verification: { body: "Kestrel Verification Services LLC", reference: "KVS-25-117", outcome: "Verified (see enclosed statement)" },
  instruments: [],
  mitigation: [],
  notApplicableSheets: {},
  warnings: [],
} satisfies EmissionsReport;

export const SOUTH_PKG: SubmissionPackage = {
  submissionId: SOUTH_IDENTITY.submissionId,
  source: "demo",
  rootDir: "/demo/submissions/DEC_Southern-Dunes-CPF2_RY2025",
  documents: Object.values(SOUTH_DOCS),
  pdfText: SOUTH_PDF_TEXT,
  report: SOUTH_REPORT,
  evidence: {},
  warnings: [],
  loadedInMs: 40,
};

// ---------------------------------------------------------------------------
// Eastern Dunes CPF-1 (compliant)
// ---------------------------------------------------------------------------

export const EAST_IDENTITY: SubmissionIdentity = {
  submissionId: "DEC_Eastern-Dunes-CPF1_RY2025",
  facilityName: "Eastern Dunes Field Central Processing Facility 1 (CPF-1)",
  facilityShortName: "Eastern Dunes CPF-1",
  operator: "Dunes Energy Company",
  operatorAr: "شركة الكثبان للطاقة",
  eadId: "AD-OG-0412",
  reportingYear: 2025,
  submittedOn: "2026-03-26",
};

const EAST_REPORT_FILE = { documentId: "ead-mrv-emissions-report-ry2025", fileName: "DEC-EDF-CPF1_EAD-MRV-Emissions-Report_RY2025.xlsx" };
export const EAST_FINDINGS: Finding[] = [
  {
    id: "F-01",
    checkId: "declared-data-gap",
    title: "Declared data gap at LP flare meter FT-5102",
    category: "data_gap",
    severity: "info",
    outcome: "signal",
    summary: "A data gap at FT-5102 from 11 to 13 March 2025 was declared in sheet H1 and filled with the 30-day average required by the Monitoring Plan; EAD was notified.",
    details: [],
    evidence: [{ ...EAST_REPORT_FILE, locator: "Sheet H1_Data_Gaps, row SS-03", sheet: "H1_Data_Gaps", rows: "SS-03" }],
    ruleIds: ["EAD-TGD-DATA-GAPS"],
    metrics: { days: 3 },
  },
  {
    id: "F-02",
    checkId: "satellite-methane",
    title: "Satellite signal explained by a declared blowdown",
    category: "satellite",
    severity: "info",
    outcome: "signal",
    summary: "A simulated detection on 9 April 2025 (610 kg/h at vent stack V-210) matches a declared, quantified planned blowdown (PTW-25-0418, sheet G line M-09).",
    details: [],
    evidence: [
      { documentId: "flare-log-daily-2025", fileName: "DEC-EDF-CPF1_Flare-Log_Daily_2025.csv", locator: "Row 2025-04-09", rows: "2025-04-09" },
      { ...EAST_REPORT_FILE, locator: "Sheet G_Methane, row M-09", sheet: "G_Methane", rows: "M-09" },
    ],
    ruleIds: [],
    metrics: { rateKgPerH: 610 },
  },
];

export const EAST_METRICS: ReviewMetrics = {
  reportedTotalTco2e: 242693,
  co2T: 225851,
  ch4T: 601.5,
  productionMmboe: 19.21,
  intensityKgCo2ePerBoe: 12.63,
  ch4IntensityTPerMmboe: 31.3,
  peerMedianIntensity: 13.4,
  peerMinIntensity: 11.9,
  peerMaxIntensity: 16.2,
  intensityPercentile: 38,
  priorYearTotalTco2e: 246838,
  yoyTotalPct: -1.7,
  yoyProductionPct: -1.1,
  estimatedUnderReportingTco2e: 0,
  estimatedUnderReportingPct: 0,
  correctedTotalTco2e: 242693,
  correctedIntensityKgCo2ePerBoe: 12.63,
};

export const EAST_REVIEW: Review = baseReview({
  id: "rev-east",
  submissionId: EAST_IDENTITY.submissionId,
  status: "compliant",
  riskScore: 12,
  riskBand: "low",
  findings: EAST_FINDINGS,
  checks: SOUTH_CHECKS.map((c) => ({
    ...c,
    status: "pass" as const,
    findingIds: [],
    message: c.category === "methane" ? "All 9 methane sources quantified in sheet G, supported by the LDAR survey." : "No issue found.",
  })),
  metrics: EAST_METRICS,
  recommendedAction: { primary: "approve", alsoConsider: [], rationale: "All checks passed; the declared data gap and the satellite detection are explained.", ruleIds: [] },
  inputHash: "east0412hash",
});

// ---------------------------------------------------------------------------
// Builders and fake client
// ---------------------------------------------------------------------------

export const narrativeInput = (review: Review, identity: SubmissionIdentity): NarrativeInput => ({
  identity,
  findings: review.findings,
  checks: review.checks,
  metrics: review.metrics,
  status: review.status,
  riskScore: review.riskScore,
  recommendedAction: review.recommendedAction,
  rules: RULES,
  inputHash: review.inputHash,
});

export const letterInput = (review: Review, identity: SubmissionIdentity, action: LetterInput["action"], officerName?: string): LetterInput => ({
  identity,
  review,
  action,
  rules: RULES,
  ...(officerName ? { officerName } : {}),
});

/** Fake OpenRouter client: `respond` returns the model's JSON (validated with the caller's schema) or throws. */
export function fakeClient(respond: (schemaName: string) => unknown): OpenRouterClient & { calls: { schemaName: string; system: string; user: string }[] } {
  const calls: { schemaName: string; system: string; user: string }[] = [];
  return {
    model: "fake/model",
    calls,
    async chat() {
      throw new Error("chat() not used");
    },
    async chatJson(options) {
      const content = (role: string) => options.messages.filter((m) => m.role === role).map((m) => m.content).join("\n");
      calls.push({ schemaName: options.schemaName, system: content("system"), user: content("user") });
      const data = options.schema.parse(respond(options.schemaName));
      return { content: JSON.stringify(data), model: "fake/model", data };
    },
  };
}

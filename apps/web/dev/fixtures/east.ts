import type { CheckRun, DocumentFacts, Finding } from "@zerocarbon/shared";
import { EAST_FILES, EAST_REFS as R, EAST_REPORT } from "./reports";
import type { FacilityFixture, ReviewFixture } from "./types";

const BLOWDOWN_NOTE =
  "Planned depressurisation of K-201A to atmosphere via vent stack V-210 (PTW-25-0418), 11:50-15:40. Vented 4,700 Sm3. Reported in sheet G (blowdowns).";

const findings: Finding[] = [
  {
    id: "F-01",
    checkId: "data-gaps",
    title: "Declared FT-5102 data gap handled per the Monitoring Plan",
    category: "data_gap",
    severity: "info",
    outcome: "signal",
    summary:
      "LP flare meter FT-5102 was offline from 11 to 13 March 2025. The gap is declared in sheet H1, substituted with the 30-day average (21,315 Sm3, about 58 t CO2e) and EAD was notified on 2 April 2025, as Monitoring Plan section 8.3 requires.",
    details: [
      "Flare log 2025-03-11 to 2025-03-13: lp_data_source \"SUBSTITUTED (30-day average)\" (7,142, 7,092 and 7,081 Sm3).",
      "Sheet H1 (a): cause, substitution method and impact (58 t CO2e, 0.02% of total) declared; EAD notified within 30 days.",
      "FT-5102 transducer replaced and recalibrated on 14 March 2025 (certificate GCS-CAL-25-0276).",
      "The cover letter discloses the gap, so the declarations are consistent with the evidence.",
    ],
    evidence: [
      R.rows("flareLog", "2025-03-11..2025-03-13", "FT-5102 LP flare meter offline (transducer fault). Volume substituted with 30-day average per MP section 8.3.", "lp_data_source"),
      R.sheet("H1_Verification_Data_Gaps", "SS-03 LP flare gas", "Average of the preceding 30 days of metered data (Monitoring Plan section 8.3). EAD notified 02-Apr-2025.", "(a) Data gaps"),
      R.page("calibration", 3, "Date of calibration 14 March 2025", "FT-5102 certificate GCS-CAL-25-0276"),
      R.page("cover", 1, "One minor data gap (LP flare meter FT-5102, 11 to 13 March 2025) was identified, substituted in accordance with the Monitoring Plan and is reported in sheet H1.", "Declaration"),
    ],
    ruleIds: ["EAD-TGD-DATA-GAPS"],
    impact: { tco2e: 0, basis: "Declared and substituted by the operator (58 t CO2e already included in the total)", countsTowardTotal: false },
    metrics: { gapDays: 3, substitutedSm3: 21315, declaredImpactTco2e: 58, shareOfTotalPct: 0.02, notifiedOn: "2025-04-02" },
    explanation:
      "One of the flare meters failed for three days in March. The operator did exactly what its Monitoring Plan says: it filled the missing days with the average of the previous 30 days, recorded the gap in the report, told EAD within 30 days and had the meter repaired and recalibrated. The effect is about 58 t CO2e, which is already included in the reported total. No action is needed; this is noted to show that the gap was checked.",
  },
  {
    id: "F-02",
    checkId: "satellite",
    title: "Satellite detection explained by a declared blowdown",
    category: "satellite",
    severity: "info",
    outcome: "signal",
    summary:
      "The only simulated detection, 610 kg CH4/h at vent stack V-210 on 9 April 2025 at 13:34 local time, falls inside the planned K-201A depressurisation logged from 11:50 to 15:40 (PTW-25-0418), which is quantified in sheet G line M-09.",
    details: [
      "SIM-2025-0409-E1: 610 +/- 280 kg CH4/h, medium confidence, 40 m from vent stack V-210.",
      "Flare log 2025-04-09: planned depressurisation via V-210 under PTW-25-0418, 4,700 Sm3 vented.",
      "4,700 Sm3 x 0.5283 t CH4/10^3 Sm3 = 2.5 t CH4 over 3 h 50 min, about 650 kg CH4/h, consistent with the detected rate.",
      "Sheet G M-09 reports 3 blowdown events (7,900 Sm3, 4.2 t CH4) including this one.",
    ],
    evidence: [
      R.reference("satellite", "Detection SIM-2025-0409-E1", "SIM-2025-0409-E1", "A satellite detection is a signal to investigate, not proof of non-compliance."),
      R.rows("flareLog", "2025-04-09", BLOWDOWN_NOTE, "event_notes"),
      R.sheet("G_Methane", "M-09", "Events logged under PTW-25-0418, -0733, -1102."),
    ],
    ruleIds: ["EAD-TGD-COMPLETENESS"],
    impact: { tco2e: 0, basis: "Event already quantified in sheet G (M-09)", countsTowardTotal: false },
    metrics: { detections: 1, rateKgCh4PerH: 610, uncertaintyKgPerH: 280, ventedSm3: 4700, impliedRateKgCh4PerH: 650, date: "2025-04-09" },
    explanation:
      "Simulated satellite data shows a methane plume at this site on 9 April 2025. The operator's own log records a planned release of gas from a compressor through the vent stack at that exact time, under a work permit, and the report already includes it. The size of the plume matches the volume the operator declared. This shows the detection has an innocent, reported explanation, so no follow-up is needed.",
  },
];

const checks: CheckRun[] = [
  { checkId: "completeness", title: "Submission completeness", category: "completeness", status: "pass", message: "Workbook sheets A to K, Monitoring Plan, verification statement, cover letter and 7 evidence files present", findingIds: [] },
  { checkId: "deadline", title: "Reporting deadline", category: "deadline", status: "pass", message: "Submitted 18 Mar 2026, before the 31 March deadline", findingIds: [] },
  { checkId: "recalculation", title: "Recalculation of reported totals", category: "calculation", status: "pass", message: "4 source streams and 9 methane lines recalculated; 242,693 t CO2e reproduced within 0.1%", findingIds: [] },
  { checkId: "evidence-crosscheck", title: "Workbook against evidence files", category: "evidence", status: "pass", message: "Fuel gas, flare and diesel match the evidence; metered flare within 0.03% of the gas balance", findingIds: [] },
  { checkId: "data-gaps", title: "Data gaps and meter calibration", category: "data_gap", status: "pass", message: "1 declared gap (FT-5102, 11 to 13 Mar 2025) substituted per MP 8.3; all meters in calibration", findingIds: ["F-01"] },
  { checkId: "emission-factor", title: "Emission factors against lab analyses", category: "emission_factor", status: "pass", message: "SS-01 uses the lab mean 56.86 t CO2/TJ; flare factor 2.417 t CO2/10^3 Sm3 matches the certificate", findingIds: [] },
  { checkId: "methane-completeness", title: "Methane source coverage", category: "methane", status: "pass", message: "9 of 9 methane sources quantified (601.5 t CH4), backed by the LDAR survey", findingIds: [] },
  { checkId: "peer-benchmark", title: "Peer intensity benchmark", category: "benchmark", status: "pass", message: "12.63 kg CO2e/boe, within the peer range (median 13.4)", findingIds: [] },
  { checkId: "yoy-trend", title: "Year-on-year trend", category: "trend", status: "pass", message: "Total -1.7% with production -1.1%: consistent", findingIds: [] },
  { checkId: "satellite", title: "Satellite methane detections", category: "satellite", status: "pass", message: "1 simulated detection, explained by a declared blowdown (PTW-25-0418)", findingIds: ["F-02"] },
  { checkId: "verification", title: "Verification statement", category: "verification", status: "pass", message: "Unmodified opinion, reasonable assurance, all sources in scope", findingIds: [] },
  { checkId: "declarations", title: "Operator declarations", category: "declaration", status: "pass", message: "Declarations consistent with the evidence, including the disclosed data gap", findingIds: [] },
];

const facts: DocumentFacts = {
  calibration: [
    { tag: "FT-3001", service: "Fuel gas header", certificateNo: "GCS-CAL-25-0131", calibratedOn: "2025-01-22", nextDue: "2026-01-31", result: "PASS", evidence: R.page("calibration", 1, "Next calibration due 31 January 2026") },
    { tag: "FT-5101", service: "HP flare header", certificateNo: "GCS-CAL-25-0152", calibratedOn: "2025-02-04", nextDue: "2026-02-28", result: "PASS", evidence: R.page("calibration", 2, "Next calibration due 28 February 2026") },
    { tag: "FT-5102", service: "LP flare header", certificateNo: "GCS-CAL-25-0276", calibratedOn: "2025-03-14", nextDue: "2026-03-31", result: "PASS", evidence: R.page("calibration", 3, "Next calibration due 31 March 2026") },
  ],
  gasAnalysis: {
    reportNo: "SAL-25-GC-0412",
    issuedOn: "2025-11-28",
    samples: (["2025-02-11", "2025-05-13", "2025-08-12", "2025-11-11"] as const).flatMap((sampledOn, i) => [
      { sampleId: `SAL-25-GC-0412-FG-Q${i + 1}`, samplingPoint: "SP-3001 fuel gas header", stream: "fuel" as const, sampledOn },
      { sampleId: `SAL-25-GC-0412-FL-Q${i + 1}`, samplingPoint: "SP-5101 HP flare header", stream: "flare" as const, sampledOn },
    ]),
    fuelEfMeanTco2PerTj: 56.86,
    fuelNcvMeanMjPerSm3: 36.12,
    flareCo2FactorTPer1000Sm3: 2.417,
    evidence: [
      R.page("gasAnalysis", 1, "Report number SAL-25-GC-0412"),
      R.page("gasAnalysis", 2, "CO2 emission factor (t CO2/TJ) 56.89 56.81 56.86 56.88 56.86"),
      R.page("gasAnalysis", 2, "CO2 per 10^3 Sm3 flared at CE 0.98 (t) 2.418 2.413 2.419 2.420 2.417"),
    ],
  },
  verification: {
    reference: "KVS-25-094",
    date: "2026-03-10",
    body: "Kestrel Verification Services LLC",
    opinion: "unmodified",
    assuranceLevel: "Reasonable",
    materialityPct: 5,
    scopeExclusions: [],
    findings: [
      { id: "F-01", description: "M-06: pneumatic device count updated from 44 to 42 after field verification of the device inventory.", status: "closed", evidence: R.page("verification", 2, "pneumatic device count updated from 44 to 42", "section 4") },
      { id: "F-02", description: "SS-04: diesel is monitored at Tier 1 using supplier invoices. Tank level gauging would allow Tier 2.", status: "open (improvement)", evidence: R.page("verification", 2, "Tank level gauging would allow Tier 2.", "section 4") },
    ],
    evidence: [
      R.page("verification", 1, "CO2 and CH4 emissions from all source streams (SS-01 to SS-04) and methane sources (M-01 to M-09) described in Monitoring Plan Rev 4.0.", "section 1"),
      R.page("verification", 2, "Unmodified opinion.", "section 5"),
    ],
  },
  monitoringPlan: {
    documentNo: "DEC-EDF-CPF1-HSE-MP-001",
    revision: "4.0",
    date: "2025-03-20",
    statements: [
      { topic: "methane_method", section: "6", text: "All methane sources at the facility are quantified as follows. Results are reported in sheet G of the emissions report.", evidence: R.page("plan", 3, "All methane sources at the facility are quantified as follows.", "section 6") },
      { topic: "tank_venting", section: "2", text: "Crude is stabilised and stored in two fixed-roof tanks (T-401A/B) whose vapours are recovered by VRU-401 before export by pipeline.", evidence: R.page("plan", 1, "whose vapours are recovered by VRU-401", "section 2") },
      { topic: "data_gap_procedure", section: "8.3", text: "Where a meter is unavailable, missing data are substituted with the average of the 30 days of valid data preceding the gap. Gaps are recorded in sheet H1 of the emissions report and notified to the Agency within 30 days.", evidence: R.page("plan", 4, "Where a meter is unavailable, missing data are substituted with the average of the 30 days of valid data preceding the gap.", "section 8.3") },
      { topic: "reconciliation_control", section: "8.2", text: "Monthly reconciliation of flare meter totals against the gas balance in the production allocation report. Deviations greater than 10% are investigated and documented.", evidence: R.page("plan", 4, "Deviations greater than 10% are investigated and documented.", "section 8.2") },
      { topic: "emission_factor_method", section: "5.2", text: "EF fuel gas SS-01: site-specific, calculated from the carbon content of the same quarterly samples (Tier 3).", evidence: R.page("plan", 3, "EF fuel gas SS-01 Site-specific: calculated from the carbon content of the same quarterly samples Tier 3", "section 5.2") },
    ],
  },
  coverLetter: {
    reference: "DEC/EDF/HSE/2026/0318",
    date: "2026-03-18",
    reportedTotalTco2e: 242693,
    declarations: [
      { claim: "complete_and_accurate", text: "We confirm that the enclosed report is complete and accurate, has been prepared in accordance with the approved Monitoring Plan (Rev 4.0) and the Agency's Technical Guidance, and covers all greenhouse gas emissions within the facility boundary.", evidence: R.page("cover", 1, "We confirm that the enclosed report is complete and accurate", "Declaration") },
      { claim: "other", text: "One minor data gap (LP flare meter FT-5102, 11 to 13 March 2025) was identified, substituted in accordance with the Monitoring Plan and is reported in sheet H1.", evidence: R.page("cover", 1, "One minor data gap (LP flare meter FT-5102, 11 to 13 March 2025) was identified", "Declaration") },
      { claim: "verified", text: "Enclosure 3: verification statement KVS-25-094, Kestrel Verification Services LLC.", evidence: R.page("cover", 1, "Verification statement KVS-25-094, Kestrel Verification Services LLC", "Enclosures") },
    ],
  },
  ldar: {
    contractor: "ClearSight OGI Surveys LLC",
    surveys: [
      { period: "Q1", surveyedOn: "2025-02-24", componentsSurveyed: 9412, leaksFound: 31, leaksRepaired: 31, ch4T: 16.2 },
      { period: "Q2", surveyedOn: "2025-05-19", componentsSurveyed: 9455, leaksFound: 27, leaksRepaired: 26, ch4T: 21.4 },
      { period: "Q3", surveyedOn: "2025-08-18", componentsSurveyed: 9470, leaksFound: 24, leaksRepaired: 24, ch4T: 19.8 },
      { period: "Q4", surveyedOn: "2025-11-17", componentsSurveyed: 9470, leaksFound: 19, leaksRepaired: 19, ch4T: 16.6 },
    ],
    annualCh4T: 74,
    evidence: [R.page("ldar", 1, "Total 101 100 74.0", "Survey results")],
  },
  extractedBy: "heuristic",
  warnings: [],
};

const review: ReviewFixture = {
  aiMode: "demo",
  narrativeSource: "cache",
  status: "compliant",
  riskScore: 12,
  riskBand: "low",
  headline: "Compliant: complete, verified report in line with peers",
  summary:
    "Eastern Dunes CPF-1 reports 242,693 t CO2e (12.63 kg CO2e/boe), within the peer range, with all nine methane sources quantified and an unmodified verification opinion. The one data gap (FT-5102, 11 to 13 March 2025) was declared and substituted per the Monitoring Plan, and the only satellite detection matches a declared, quantified blowdown on 9 April 2025.",
  findings,
  checks,
  metrics: {
    reportedTotalTco2e: 242693, co2T: 225851, ch4T: 601.5, productionMmboe: 19.21, intensityKgCo2ePerBoe: 12.63, ch4IntensityTPerMmboe: 31.3,
    peerMedianIntensity: 13.4, peerMinIntensity: 10.65, peerMaxIntensity: 16.2, intensityPercentile: 43, priorYearTotalTco2e: 246838,
    yoyTotalPct: -1.7, yoyProductionPct: -1.1, estimatedUnderReportingTco2e: 0, estimatedUnderReportingPct: 0,
    correctedTotalTco2e: 242693, correctedIntensityKgCo2ePerBoe: 12.63,
  },
  recommendedAction: {
    primary: "approve",
    alsoConsider: [],
    rationale:
      "All checks pass. The declared data gap was handled as the Monitoring Plan requires, the satellite detection is explained by a reported blowdown, and the verifier issued an unmodified opinion covering all sources.",
    ruleIds: ["DL11-2024-ART6-1", "EAD-TGD-VERIFICATION"],
  },
  aiObservations: [],
  facts,
  stages: [
    { name: "ingest", status: "done", durationMs: 250, detail: "11 documents; workbook parsed (14 sheets)" },
    { name: "extract", status: "done", durationMs: 560, detail: "7 PDFs and 4 CSVs; facts extracted (heuristic)" },
    { name: "checks", status: "done", durationMs: 85, detail: "12 checks, 2 findings" },
    { name: "score", status: "done", durationMs: 10, detail: "Risk 12/100 (low)" },
    { name: "narrative", status: "done", durationMs: 7, detail: "Cached AI narrative (demo mode)" },
  ],
};

export const EAST: FacilityFixture = {
  key: "east",
  submissionId: "DEC_Eastern-Dunes-CPF1_RY2025",
  folder: "DEC_Eastern-Dunes-CPF1_RY2025",
  code: "DEC-EDF-CPF1",
  shortName: "Eastern Dunes CPF-1",
  shortNameAr: "الكثبان الشرقية CPF-1",
  facilityNameAr: "المنشأة المركزية للمعالجة 1 في حقل الكثبان الشرقية (CPF-1)",
  manager: { en: "Eng. Rashed Al Neyadi", ar: "المهندس راشد النيادي" },
  files: EAST_FILES,
  report: EAST_REPORT,
  review,
  letter: {
    findingTitlesAr: {
      "F-01": "فجوة بيانات مفصح عنها في العداد FT-5102 عولجت وفق خطة الرصد",
      "F-02": "رصد بالأقمار الاصطناعية يفسره تخفيف ضغط مخطط له ومبلغ عنه",
    },
    requests: [
      {
        en: "Confirm the 30-day average substitution for LP flare meter FT-5102 from 11 to 13 March 2025 (21,315 Sm3, about 58 t CO2e) and provide the recalibration record of 14 March 2025.",
        ar: "تأكيد تطبيق طريقة الاستعاضة بمتوسط 30 يوماً لعداد الشعلة منخفضة الضغط FT-5102 للفترة من 11 إلى 13 مارس 2025 (21,315 متراً مكعباً قياسياً، أي نحو 58 طناً من مكافئ ثاني أكسيد الكربون)، وتقديم سجل إعادة المعايرة بتاريخ 14 مارس 2025.",
      },
      {
        en: "Provide the permit-to-work and vented volume calculation for the planned depressurisation via vent stack V-210 on 9 April 2025 (PTW-25-0418, 4,700 Sm3).",
        ar: "تقديم تصريح العمل وحساب الحجم المنفس لعملية تخفيف الضغط المخطط لها عبر مدخنة التنفيس V-210 بتاريخ 9 أبريل 2025 (PTW-25-0418، 4,700 متر مكعب قياسي).",
      },
    ],
    inspection: [
      {
        en: "LP flare meter FT-5102 maintenance and recalibration records for March 2025.",
        ar: "سجلات صيانة عداد الشعلة منخفضة الضغط FT-5102 وإعادة معايرته لشهر مارس 2025.",
      },
      {
        en: "Vent stack V-210 and the permit-to-work records for the three planned depressurisations in 2025.",
        ar: "مدخنة التنفيس V-210 وسجلات تصاريح العمل الخاصة بعمليات تخفيف الضغط الثلاث المخطط لها في عام 2025.",
      },
    ],
  },
  ask: {
    flare: {
      answer:
        "Flare volumes are metered all year by FT-5101 (HP) and FT-5102 (LP), 27,304,591 Sm3 in total, within 0.03% of the gas balance (27,296,799 Sm3). The only exception is the LP flare from 11 to 13 March 2025, when FT-5102 had a transducer fault: the log shows \"SUBSTITUTED (30-day average)\" and the gap is declared in sheet H1 (about 58 t CO2e, EAD notified on 2 April 2025).",
      citations: [
        R.rows("flareLog", "2025-03-11..2025-03-13", "FT-5102 LP flare meter offline (transducer fault). Volume substituted with 30-day average per MP section 8.3.", "lp_data_source"),
        R.rows("production", "2025-01..2025-12", undefined, "flared_by_balance_sm3"),
        R.sheet("H1_Verification_Data_Gaps", "SS-03 LP flare gas", "11-13 Mar 2025 (3 days)", "(a) Data gaps"),
      ],
      ruleIds: ["EAD-TGD-DATA-GAPS"],
    },
    methane: {
      answer:
        "All nine methane sources are quantified in sheet G, 601.5 t CH4 (16,842 t CO2e) in total: flare slip 289.4 t, combustion 2.9 t, tanks with VRU-401 96.4 t, TEG still vent 58.2 t, pneumatics 31.1 t, wet seals 45.3 t, fugitives from quarterly LDAR 74.0 t and three blowdowns 4.2 t. Methane intensity is 31.3 t CH4/MMboe, within the peer range of 26.3 to 52.4.",
      citations: [R.sheet("G_Methane", "M-01..M-09"), R.page("ldar", 1, "Total 101 100 74.0", "Survey results"), R.page("plan", 3, "All methane sources at the facility are quantified as follows.", "section 6")],
      ruleIds: ["EAD-TGD-COMPLETENESS", "IPCC-AR5-GWP"],
    },
    calibration: {
      answer:
        "All three emissions meters were in calibration for the whole year: FT-3001 calibrated on 22 January 2025, FT-5101 on 4 February 2025 and FT-5102 on 14 March 2025 after the transducer replacement. Every certificate shows PASS results as found and as left.",
      citations: [R.page("calibration", 1, "Next calibration due 31 January 2026"), R.page("calibration", 2, "Next calibration due 28 February 2026"), R.page("calibration", 3, "Next calibration due 31 March 2026")],
      ruleIds: ["EAD-TGD-TIERS"],
    },
    verification: {
      answer:
        "Kestrel's statement KVS-25-094 is an unmodified opinion with reasonable assurance, covering all source streams (SS-01 to SS-04) and all methane sources (M-01 to M-09). One misstatement was corrected before submission (pneumatic device count 44 to 42) and one improvement observation remains open (tank level gauging would allow Tier 2 for diesel).",
      citations: [R.page("verification", 2, "Unmodified opinion.", "section 5"), R.page("verification", 1, "CO2 and CH4 emissions from all source streams (SS-01 to SS-04) and methane sources (M-01 to M-09) described in Monitoring Plan Rev 4.0.", "section 1")],
      ruleIds: ["EAD-TGD-VERIFICATION"],
    },
    peer: {
      answer:
        "At 12.63 kg CO2e/boe Eastern Dunes sits within its peer range (10.65 to 16.2, median 13.4), with 3 of 7 peers lower. Year on year, emissions fell from 246,838 to 242,693 t CO2e (-1.7%) while production fell 1.1%, which is consistent. Peer data is simulated.",
      citations: [R.reference("peers", "Row AD-OG-0412 and peer rows", "AD-OG-0412"), R.reference("priorYear", "Rows AD-OG-0412, RY2024", "AD-OG-0412")],
      ruleIds: ["EAD-TGD-COMPLETENESS"],
    },
    satellite: {
      answer:
        "There is one simulated detection: 9 April 2025 at 13:34 local time, 610 +/- 280 kg CH4/h at vent stack V-210. It matches the planned depressurisation of K-201A via V-210 logged the same day from 11:50 to 15:40 (PTW-25-0418, 4,700 Sm3 vented), which is quantified in sheet G line M-09. 4,700 Sm3 over 3 h 50 min is about 650 kg CH4/h, consistent with the detection, so no follow-up is needed.",
      citations: [R.reference("satellite", "Detection SIM-2025-0409-E1", "SIM-2025-0409-E1"), R.rows("flareLog", "2025-04-09", BLOWDOWN_NOTE, "event_notes"), R.sheet("G_Methane", "M-09")],
      ruleIds: ["EAD-TGD-COMPLETENESS"],
    },
    default: {
      answer:
        "Eastern Dunes CPF-1 is assessed as compliant (risk 12/100). It reports 242,693 t CO2e at 12.63 kg CO2e/boe, within the peer range, with all methane sources quantified, valid meter calibrations and an unmodified verification opinion. The one data gap was declared and handled correctly, and the only satellite detection is explained by a declared blowdown. The recommended action is to approve.",
      citations: [R.sheet("C2_Facility_Description", "TOTAL", undefined, "(f) Emissions summary"), R.page("verification", 2, "Unmodified opinion.", "section 5")],
      ruleIds: ["DL11-2024-ART6-1", "EAD-TGD-VERIFICATION"],
    },
  },
};

import type { CheckRun, DocumentFacts, Finding } from "@zerocarbon/shared";
import { SOUTH_FILES, SOUTH_REFS as R, SOUTH_REPORT } from "./reports";
import type { FacilityFixture, ReviewFixture } from "./types";

const EST_ROWS = "2025-06-01..2025-12-31";

const findings: Finding[] = [
  {
    id: "F-01",
    checkId: "methane-completeness",
    title: "Methane sources M-04 to M-08 not quantified",
    category: "methane",
    severity: "high",
    outcome: "breach",
    summary:
      "Only flare slip and combustion methane are reported (264.3 t CH4). Tanks and the TEG still vent are marked \"not applicable, closed system\" and pneumatics, seals and fugitives \"not quantified, de minimis\", although the operator's own documents identify them as vented methane sources.",
    details: [
      "Sheet G_Methane: M-04 (crude tanks) and M-05 (TEG still vent) are \"Not applicable\"; M-06 to M-08 are \"Not quantified\" and \"Considered de minimis\" with no estimate.",
      "Sheet C2 (a) says the tanks T-401A/B are \"fitted with pressure/vacuum vents\"; C2 (b) lists U-250 as \"Still vent (methane source)\" and K-201A/B with wet seals.",
      "Monitoring Plan section 3, Figure 1 shows \"P/V vents to atmosphere\", still vent and wet seal vents; section 6.3 says the quantification method is \"under development\" (target Q4 2025).",
      "Methane intensity is 10.2 t CH4/MMboe against a peer range of 26.3 to 52.4 t CH4/MMboe.",
      "Estimate: Eastern Dunes CPF-1 non-flare methane intensity of 16.1 t CH4/MMboe (309.2 t / 19.21 MMboe) x 25.82 MMboe = about 416 t CH4, or 11,648 t CO2e at GWP 28.",
    ],
    evidence: [
      R.sheet("G_Methane", "M-04..M-08", "Not applicable: closed system."),
      R.sheet("C2_Facility_Description", "T-401A/B", "fitted with pressure/vacuum vents", "(a) Non-technical summary"),
      R.page("plan", 2, "P/V vents to atmosphere", "section 3, Figure 1"),
      R.page("plan", 3, "A quantification methodology for these sources is under development and will be included in the next revision of this Monitoring Plan (target: Q4 2025).", "section 6.3"),
      R.page("verification", 1, "Methane sources M-04 to M-08 (storage tanks, TEG still vent, pneumatic controllers, compressor seals and fugitive components) are not quantified in the Monitoring Plan", "section 1"),
    ],
    ruleIds: ["EAD-TGD-COMPLETENESS", "EAD-TGD-CATEGORIES", "DL11-2024-ART6-1", "IPCC-AR5-GWP"],
    impact: {
      tco2e: 11648,
      basis: "416 t CH4 x GWP 28: Eastern Dunes CPF-1 non-flare methane intensity (16.1 t CH4/MMboe) x 25.82 MMboe",
      countsTowardTotal: true,
    },
    metrics: {
      reportedCh4T: 264.3, sourcesListed: 9, sourcesQuantified: 3, ch4IntensityTPerMmboe: 10.2, peerCh4IntensityMin: 26.3, peerCh4IntensityMax: 52.4,
      referenceIntensityTPerMmboe: 16.1, estimatedMissingCh4T: 416, estimatedMissingTco2e: 11648,
    },
    explanation:
      "The report only counts methane from the flares and from burning fuel. Five other sources that every oil processing site of this kind has (the crude tanks, the glycol dehydrator vent, gas-driven controllers, compressor seals and small leaks) are either marked as not applicable or waved away as too small, without any number to back that up. The operator's own facility description and site drawing show that the tanks vent to atmosphere, and its Monitoring Plan admits the method for these sources is still being developed. Using the sister facility Eastern Dunes, which does measure them, as a yardstick, roughly 416 t of methane (about 11,648 t CO2e) is missing.",
  },
  {
    id: "F-02",
    checkId: "data-gaps",
    title: "Undeclared data gap on HP flare meter FT-5101",
    category: "data_gap",
    severity: "high",
    outcome: "breach",
    summary:
      "FT-5101's calibration expired on 31 May 2025. From 1 June to 31 December the flare log records \"ENGINEERING ESTIMATE\" for 214 days (6,752,500 Sm3, 31% of SS-02), yet sheet H1 declares no data gaps and sheet I lists the meter as \"In service\".",
    details: [
      "Calibration certificate GCS-CAL-24-0562 (page 2): FT-5101 calibrated on 28 May 2024, next calibration due 31 May 2025.",
      "Flare log from 2025-06-01: hp_data_source \"ENGINEERING ESTIMATE\" with flat monthly values (31,500 Sm3/d in June). Mean 31,554 Sm3/d against 99,324 Sm3/d metered from January to May, 68.2% lower.",
      "Sheet H1 (a): \"No data gaps identified during the reporting period.\" Sheet D1 declares SS-02 at Tier 2 via FT-5101, sheet F declares no fallback, and sheet I lists FT-5101 as \"In service\".",
      "Monitoring Plan section 8.3 requires 30-day average substitution, recording in H1, notification to EAD within 30 days, and a plan revision within 30 days when a meter is out of service for more than 30 days. None of these steps is evidenced.",
      "Verifier finding F-03 (open): the estimation model was not documented and could not be corroborated against the gas balance.",
    ],
    evidence: [
      R.page("calibration", 2, "Next calibration due 31 May 2025", "FT-5101 certificate GCS-CAL-24-0562"),
      R.rows("flareLog", EST_ROWS, "FT-5101 removed for recalibration (vendor backlog). HP flare volume estimated from engineering model until meter reinstated.", "hp_data_source"),
      R.sheet("H1_Verification_Data_Gaps", "None", "No data gaps identified during the reporting period.", "(a) Data gaps"),
      R.sheet("I_Management_QA", "FT-5101", "In service", "(c) Measuring instruments register"),
      R.sheet("F_Fallback_Approach", undefined, "No fallback methodology has been applied during the reporting period."),
      R.page("plan", 4, "Where a meter is expected to be out of service for more than 30 days, this Monitoring Plan is revised and resubmitted to the Agency within 30 days of the change.", "section 8.3"),
      R.page("verification", 2, "the calibration of HP flare meter FT-5101 expired on 31 May 2025 and the meter was removed on 1 June 2025 and not reinstated during the reporting period.", "section 4, finding F-03"),
    ],
    ruleIds: ["EAD-TGD-DATA-GAPS", "EAD-TGD-MP-UPDATE", "EAD-TGD-TIERS", "EAD-TGD-FALLBACK"],
    impact: {
      tco2e: 39447,
      basis: "The estimated HP flare volumes are the cause of the gas balance gap quantified in F-03; counted there, not here",
      countsTowardTotal: false,
    },
    metrics: {
      estimatedDays: 214, estimatedSm3: 6752500, shareOfSs02Pct: 31, meteredMeanSm3PerDay: 99324, estimatedMeanSm3PerDay: 31554, dropPct: 68.2,
      calibrationDue: "2025-05-31", firstEstimateDate: "2025-06-01",
    },
    explanation:
      "The meter that measures the main flare stopped being valid at the end of May 2025, and from the next day the operator replaced its readings with flat, round-number estimates for the rest of the year. That is a data gap, and the rules and the operator's own Monitoring Plan say it must be declared, filled with a defined substitution method, notified to EAD and followed by a revised plan. Instead the report says there were no data gaps and that the meter was in service all year. The estimates are about two thirds lower than what the meter was reading before it was removed, which is why this matters for the total.",
  },
  {
    id: "F-03",
    checkId: "evidence-crosscheck",
    title: "Flare volumes contradict the operator's own gas balance",
    category: "evidence",
    severity: "critical",
    outcome: "breach",
    summary:
      "From June to December the reported flare volume is 62.2% below the operator's own gas balance: 8,680,437 Sm3 reported against 22,976,806 Sm3 by balance. From January to May, while FT-5101 was metering, the two agree within 0.4%.",
    details: [
      "January to May: 16,369,935 Sm3 metered against 16,307,191 Sm3 by balance (-0.4%).",
      "June to December: 8,680,437 Sm3 reported in D2 (b) against 22,976,806 Sm3 in column flared_by_balance_sm3 (-62.2%).",
      "Gap of 14,296,369 Sm3 x 2.468 t CO2/10^3 Sm3 = 35,283 t CO2, plus 148.7 t CH4 flare slip x 28 = 4,164 t CO2e: about 39,447 t CO2e, or 14.3% of the reported total.",
      "Monitoring Plan section 8.2 and sheet H1 (c) require deviations above 10% to be investigated and documented. No investigation is recorded.",
    ],
    evidence: [
      R.rows("production", "2025-06..2025-12", undefined, "flared_by_balance_sm3"),
      R.sheet("D2_Calculation_Approach", "Jun..Dec", undefined, "(b) Monthly activity data"),
      R.rows("production", "2025-01..2025-05", undefined, "flared_by_balance_sm3"),
      R.page("plan", 4, "Monthly reconciliation of flare meter totals against the gas balance in the production allocation report. Deviations greater than 10% are investigated and documented.", "section 8.2"),
      R.sheet("H1_Verification_Data_Gaps", "SS-02/03 Flare", undefined, "(c) Self-verification"),
    ],
    ruleIds: ["EAD-TGD-COMPLETENESS", "EAD-TGD-DATA-GAPS", "EAD-TGD-CORRECTIONS"],
    impact: {
      tco2e: 39447,
      basis: "14,296,369 Sm3 x 2.468 t CO2/10^3 Sm3 (35,283 t CO2) + 148.7 t CH4 flare slip x 28 (4,164 t CO2e)",
      countsTowardTotal: true,
    },
    metrics: {
      reportedSm3: 8680437, balanceSm3: 22976806, gapSm3: 14296369, diffPct: -62.2, meteredReportedSm3: 16369935, meteredBalanceSm3: 16307191,
      meteredPeriodDiffPct: -0.4, gapCo2T: 35283, gapCh4T: 148.7, gapTco2e: 39447,
    },
    explanation:
      "The company keeps a production gas balance: gas produced minus gas used, exported and reinjected must have gone to the flare. While the flare meter worked, that balance matched the meter almost exactly. After the meter was removed, the reported flare volumes fall to about a third of what the balance says was flared. The difference, about 14.3 million Sm3 of gas, corresponds to roughly 39,447 t CO2e that is not in the report. This is the single largest reason the facility looks better than its peers.",
  },
  {
    id: "F-04",
    checkId: "emission-factor",
    title: "Wrong fuel gas emission factor on SS-01",
    category: "emission_factor",
    severity: "medium",
    outcome: "breach",
    summary:
      "SS-01 uses 56.1 t CO2/TJ, the IPCC 2006 default for natural gas, but labels it \"site-specific Tier 3\". The laboratory certificate gives an annual mean of 56.96 t CO2/TJ, so fuel gas CO2 is understated by 3,084 t (1.1%).",
    details: [
      "Sheet D2 row SS-01: EF 56.1 t CO2/TJ, tiers \"AD Tier 3 / NCV Tier 3 / EF Tier 3\", data source \"NCV and EF site-specific from quarterly GC analysis\".",
      "Gas analysis certificate SAL-25-GC-0417, page 2: quarterly CO2 emission factors 56.99, 56.96, 57.00 and 56.89; mean 56.96 t CO2/TJ.",
      "Monitoring Plan section 5.2 requires the site-specific factor calculated from the quarterly samples.",
      "Recalculation: 3,585.6 TJ x 56.96 = 204,236 t CO2 against 201,152 t reported (+3,084 t). Below the 5% materiality threshold but systematic. Verifier finding F-01 is open.",
    ],
    evidence: [
      R.sheet("D2_Calculation_Approach", "SS-01", "AD Tier 3 / NCV Tier 3 / EF Tier 3", "(a) Annual calculation"),
      R.page("gasAnalysis", 2, "CO2 emission factor (t CO2/TJ) 56.99 56.96 57.00 56.89 56.96", "fuel gas calculated properties"),
      R.page("plan", 3, "EF fuel gas SS-01 Site-specific: calculated from the carbon content of the same quarterly samples Tier 3", "section 5.2"),
      R.page("verification", 2, "the IPCC default emission factor (56.10 t CO2/TJ) was applied instead of the site-specific factor required by Monitoring Plan section 5.2", "section 4, finding F-01"),
    ],
    ruleIds: ["EAD-TGD-TIERS", "IPCC-2006-DEFAULTS", "EAD-TGD-CORRECTIONS"],
    impact: { tco2e: 3084, basis: "3,585.6 TJ x (56.96 - 56.10) t CO2/TJ", countsTowardTotal: true },
    metrics: { usedEf: 56.1, labEf: 56.96, energyTj: 3585.6, reportedCo2T: 201152, recalculatedCo2T: 204236, differenceT: 3084, differencePct: 1.1 },
    explanation:
      "The fuel gas calculation uses a generic textbook factor while claiming it is the facility's own measured value. The laboratory results the company itself commissioned give a slightly higher factor, so fuel gas emissions are about 3,084 t CO2 too low. On its own this is small (about 1% of the total, below the verifier's 5% materiality), but it is a clear, easy-to-fix inconsistency with the approved Monitoring Plan that the verifier also flagged.",
  },
  {
    id: "F-05",
    checkId: "peer-benchmark",
    title: "Lowest intensity in the peer set while production rose",
    category: "benchmark",
    severity: "medium",
    outcome: "signal",
    summary:
      "At 10.65 kg CO2e/boe Southern Dunes is the lowest in its peer set (median 13.4, range 11.9 to 16.2). Total emissions fell 9.0% year on year while production rose 2.5%, and the flare streams alone fell more than the whole decline.",
    details: [
      "Methane intensity 10.2 t CH4/MMboe against peers at 26.3 to 52.4 t CH4/MMboe; only 3 methane sources quantified against 7 to 9 for peers.",
      "RY2024: 302,003 t CO2e at 25.19 MMboe (11.99 kg CO2e/boe). RY2025: 274,896 t CO2e at 25.82 MMboe.",
      "The flare streams fell by 28,998 t CO2 (90,822 to 61,824 t), more than the whole 27,107 t decline.",
      "The only implemented mitigation (MM-01, GTG-A upgrade, commissioned November 2025) saves about 2,100 t CO2e a year.",
      "Corrected for F-01, F-03 and F-04, the facility would report about 329,075 t CO2e, or 12.74 kg CO2e/boe, in line with its peers.",
    ],
    evidence: [
      R.reference("peers", "Row AD-OG-0417 and peer rows", "AD-OG-0417", "AD-OG-0417,Dunes Energy Company,Southern Dunes CPF-2,Abu Dhabi,22.814,54.1375,2025,25.82,274896,267496,264.3,10.65,10.2,0.97,3,Qualified"),
      R.reference("priorYear", "Rows AD-OG-0417, RY2024", "AD-OG-0417"),
      R.sheet("C2_Facility_Description", "TOTAL", undefined, "(f) Emissions summary"),
      R.sheet("J_Mitigation_Measures", "MM-01", "Commissioned November 2025."),
    ],
    ruleIds: ["EAD-TGD-COMPLETENESS"],
    metrics: {
      intensityKgCo2ePerBoe: 10.65, peerMedian: 13.4, peerMin: 11.9, peerMax: 16.2, ch4IntensityTPerMmboe: 10.2, peerCh4Min: 26.3, peerCh4Max: 52.4,
      yoyTotalPct: -9.0, yoyProductionPct: 2.5, flareDeclineT: 28998, totalDeclineT: 27107, correctedIntensity: 12.74,
    },
    explanation:
      "On paper this facility is the cleanest producer in its group, and it became cleaner while producing more. Nothing in the report explains that: the only efficiency project finished in November and saves about 2,100 t a year. Almost all of the drop comes from lower flaring after the flare meter was removed. Once the flare gap, missing methane and emission factor are corrected, the facility sits at 12.74 kg CO2e/boe, right in the middle of its peers. This is not a breach on its own, but it supports the findings above. Peer data is simulated for the demo.",
  },
  {
    id: "F-06",
    checkId: "satellite",
    title: "Satellite methane signals at the HP flare and tank farm (simulated)",
    category: "satellite",
    severity: "high",
    outcome: "signal",
    summary:
      "Three simulated satellite detections in 2025. The largest, 1,820 kg CH4/h at HP flare FL-501 on 14 July, was captured at 13:31 local time during a logged pilot flame-out (12:05 to 18:35), when gas was likely vented unburnt while the report assumes 98% combustion.",
    details: [
      "SIM-2025-0714-S1, 14 Jul 2025 13:31 GST: 1,820 +/- 610 kg CH4/h, high confidence, 40 m from FL-501. Flare log 2025-07-14: \"FLAME-OUT ALARM 12:05-18:35\".",
      "SIM-2025-0802-S2, 2 Aug 2025 13:36 GST: 940 +/- 380 kg CH4/h at FL-501 during the logged K-201B compressor trip (10:40 to 16:15); the flare volume that day is an engineering estimate (58,000 Sm3).",
      "SIM-2025-1019-S3, 19 Oct 2025 13:28 GST: 710 +/- 300 kg CH4/h at tank farm T-401A/B with no logged event, contradicting the \"closed system\" claim for M-04.",
      "If the 14 July rate held for the 6.5 hour flame-out, about 11.8 t CH4 (331 t CO2e) was vented and is not in the report.",
      "Detections are simulated for the demo: a signal to investigate, not proof of non-compliance.",
    ],
    evidence: [
      R.reference("satellite", "Detections SIM-2025-0714-S1, SIM-2025-0802-S2, SIM-2025-1019-S3", "SIM-2025-0714-S1..SIM-2025-1019-S3", "A satellite detection is a signal to investigate, not proof of non-compliance."),
      R.rows("flareLog", "2025-07-14", "FLAME-OUT ALARM 12:05-18:35", "pilot_status"),
      R.rows("flareLog", "2025-08-02", "K-201B compressor trip 10:40-16:15; gas routed to HP flare. Volume per engineering estimate.", "event_notes"),
      R.sheet("G_Methane", "M-04", "Not applicable: closed system."),
    ],
    ruleIds: ["EAD-TGD-INSPECTION", "EAD-TGD-COMPLETENESS"],
    metrics: { detections: 3, maxRateKgCh4PerH: 1820, flameOutHours: 6.5, flameOutCh4T: 11.8, tankFarmRateKgCh4PerH: 710, firstDetection: "2025-07-14" },
    explanation:
      "Simulated satellite imagery picked up three methane plumes at this site. The strongest one lines up, to the hour, with the operator's own log entry saying the flare's pilot flame had gone out, which means gas was going up the stack without being burnt. The report assumes the flare burns 98% of the methane all year. A third plume came from the crude tanks on a day with no logged event, although the report says the tanks are a closed system. These are leads for an inspection, not evidence of a breach on their own.",
  },
  {
    id: "F-07",
    checkId: "verification",
    title: "Qualified verification contradicts the operator declarations",
    category: "verification",
    severity: "high",
    outcome: "breach",
    summary:
      "The verifier issued a qualified opinion (F-03 unresolved) and excluded methane sources M-04 to M-08 from scope, yet sheet H1 records the outcome as \"Verified (see enclosed statement)\" and the cover letter declares the report complete and accurate with no data gaps.",
    details: [
      "Verification statement KVS-25-117, section 5: qualified opinion. Basis: HP flare volumes from 1 June to 31 December 2025 rest on uncorroborated engineering estimates.",
      "Section 1: M-04 to M-08 excluded from the verification scope at the request of the operator.",
      "Section 4: findings F-01 (emission factor), F-03 (FT-5101) and F-04 (methane) remain open.",
      "Sheet H1 (b): \"Verified (see enclosed statement)\". Cover letter: \"No data gaps occurred during the reporting period.\" Sheet C1 (e) declares that all emissions have been reported.",
      "Verification is voluntary until 2027, but a submitted statement must be represented accurately and its recommendations taken into account.",
    ],
    evidence: [
      R.page("verification", 2, "Qualified opinion. Based on the procedures performed and the evidence obtained, except for the possible effects of the matter described in finding F-03", "section 5"),
      R.page("verification", 1, "were excluded from the scope of this verification at the request of the operator.", "section 1"),
      R.sheet("H1_Verification_Data_Gaps", "Verification outcome", "Verified (see enclosed statement)", "(b) Verification"),
      R.page("cover", 1, "No data gaps occurred during the reporting period.", "Declaration"),
      R.sheet("C1_Identifiers", undefined, "that all emissions from the facility have been reported", "(e) Operator declaration"),
    ],
    ruleIds: ["EAD-TGD-VERIFICATION", "EAD-TGD-CORRECTIONS", "DL11-2024-ART6-1"],
    metrics: { opinion: "qualified", openVerifierFindings: 3, scopeExclusions: "M-04 to M-08", materialityPct: 5 },
    explanation:
      "The independent verifier did not give the report a clean bill of health. It qualified its opinion because it could not check the flare estimates, and it left five methane sources out of its scope because the company asked it to. The company's own summary of that statement simply says \"Verified\", and the cover letter signed by the facility manager says the report is complete and that no data gaps occurred. Those declarations are not accurate, and they are what the regulator relies on when it accepts a report.",
  },
];

const checks: CheckRun[] = [
  { checkId: "completeness", title: "Submission completeness", category: "completeness", status: "pass", message: "Workbook sheets A to K, Monitoring Plan, verification statement, cover letter and 6 evidence files present", findingIds: [] },
  { checkId: "deadline", title: "Reporting deadline", category: "deadline", status: "pass", message: "Submitted 30 Mar 2026, before the 31 March deadline", findingIds: [] },
  { checkId: "recalculation", title: "Recalculation of reported totals", category: "calculation", status: "pass", message: "4 source streams and 9 methane lines recalculated; 274,896 t CO2e reproduced within 0.1%", findingIds: [] },
  { checkId: "evidence-crosscheck", title: "Workbook against evidence files", category: "evidence", status: "fail", message: "Fuel gas and diesel match the evidence; flare June to December is 62.2% below the gas balance", findingIds: ["F-03"] },
  { checkId: "data-gaps", title: "Data gaps and meter calibration", category: "data_gap", status: "fail", message: "FT-5101 out of calibration from 31 May 2025 and estimated for 214 days, but H1 declares no data gaps", findingIds: ["F-02"] },
  { checkId: "emission-factor", title: "Emission factors against lab analyses", category: "emission_factor", status: "fail", message: "SS-01 uses the IPCC default 56.1 t CO2/TJ instead of the lab mean 56.96 t CO2/TJ", findingIds: ["F-04"] },
  { checkId: "methane-completeness", title: "Methane source coverage", category: "methane", status: "fail", message: "3 of 9 methane sources quantified; M-04 to M-08 missing", findingIds: ["F-01"] },
  { checkId: "peer-benchmark", title: "Peer intensity benchmark", category: "benchmark", status: "warning", message: "10.65 kg CO2e/boe, lowest of 8 peers (median 13.4)", findingIds: ["F-05"] },
  { checkId: "yoy-trend", title: "Year-on-year trend", category: "trend", status: "warning", message: "Total -9.0% while production +2.5%; flare streams -28,998 t CO2", findingIds: ["F-05"] },
  { checkId: "satellite", title: "Satellite methane detections", category: "satellite", status: "warning", message: "3 simulated detections; 14 July coincides with a logged flare flame-out", findingIds: ["F-06"] },
  { checkId: "verification", title: "Verification statement", category: "verification", status: "fail", message: "Qualified opinion with 3 open findings; M-04 to M-08 excluded from scope", findingIds: ["F-07"] },
  { checkId: "declarations", title: "Operator declarations", category: "declaration", status: "fail", message: "Cover letter and H1 declare no data gaps and a clean verification, contradicted by the evidence", findingIds: ["F-07", "F-02"] },
];

const facts: DocumentFacts = {
  calibration: [
    { tag: "FT-3001", service: "Fuel gas header", certificateNo: "GCS-CAL-25-0117", calibratedOn: "2025-01-18", nextDue: "2026-01-31", result: "PASS", evidence: R.page("calibration", 1, "Next calibration due 31 January 2026") },
    { tag: "FT-5101", service: "HP flare header", certificateNo: "GCS-CAL-24-0562", calibratedOn: "2024-05-28", nextDue: "2025-05-31", result: "PASS", evidence: R.page("calibration", 2, "Next calibration due 31 May 2025") },
    { tag: "FT-5102", service: "LP flare header", certificateNo: "GCS-CAL-25-0188", calibratedOn: "2025-02-10", nextDue: "2026-02-28", result: "PASS", evidence: R.page("calibration", 3, "Next calibration due 28 February 2026") },
  ],
  gasAnalysis: {
    reportNo: "SAL-25-GC-0417",
    issuedOn: "2025-12-03",
    samples: (["2025-02-12", "2025-05-14", "2025-08-13", "2025-11-12"] as const).flatMap((sampledOn, i) => [
      { sampleId: `SAL-25-GC-0417-FG-Q${i + 1}`, samplingPoint: "SP-3001 fuel gas header", stream: "fuel" as const, sampledOn },
      { sampleId: `SAL-25-GC-0417-FL-Q${i + 1}`, samplingPoint: "SP-5101 HP flare header", stream: "flare" as const, sampledOn },
    ]),
    fuelEfMeanTco2PerTj: 56.96,
    fuelNcvMeanMjPerSm3: 36.35,
    flareCo2FactorTPer1000Sm3: 2.468,
    evidence: [
      R.page("gasAnalysis", 1, "Report number SAL-25-GC-0417"),
      R.page("gasAnalysis", 2, "CO2 emission factor (t CO2/TJ) 56.99 56.96 57.00 56.89 56.96"),
      R.page("gasAnalysis", 2, "CO2 per 10^3 Sm3 flared at CE 0.98 (t) 2.466 2.474 2.474 2.460 2.468"),
    ],
  },
  verification: {
    reference: "KVS-25-117",
    date: "2026-03-24",
    body: "Kestrel Verification Services LLC",
    opinion: "qualified",
    assuranceLevel: "Reasonable",
    materialityPct: 5,
    scopeExclusions: ["M-04", "M-05", "M-06", "M-07", "M-08"],
    findings: [
      { id: "F-01", description: "SS-01: the IPCC default emission factor (56.10 t CO2/TJ) was applied instead of the site-specific factor (mean 56.96 t CO2/TJ). Understatement 3,084 t CO2 (1.1% of total), below materiality.", status: "open", impactTco2e: 3084, evidence: R.page("verification", 2, "Understatement 3,084 t CO2 (1.1% of total)", "section 4") },
      { id: "F-02", description: "SS-04: one diesel delivery was counted twice in the draft report (+62.4 t diesel). Corrected in the final report.", status: "closed", evidence: R.page("verification", 2, "one diesel delivery was counted twice in the draft report (+62.4 t diesel).", "section 4") },
      { id: "F-03", description: "SS-02: FT-5101 calibration expired on 31 May 2025; HP flare volumes from 1 June to 31 December 2025 (6,752,500 Sm3, 31% of SS-02) are undocumented engineering estimates. MP section 8.3 not applied and the plan not revised.", status: "open", evidence: R.page("verification", 2, "HP flare volumes from 1 June to 31 December 2025 (6,752,500 Sm3, 31% of SS-02) are engineering estimates.", "section 4") },
      { id: "F-04", description: "Methane sources M-04 to M-08 are not quantified (Monitoring Plan section 6.3). Quantification is required for a complete report.", status: "open", evidence: R.page("verification", 2, "Quantification is required for a complete report.", "section 4") },
    ],
    evidence: [R.page("verification", 1, "Statement reference KVS-25-117"), R.page("verification", 2, "Qualified opinion.", "section 5")],
  },
  monitoringPlan: {
    documentNo: "DEC-SDF-CPF2-HSE-MP-001",
    revision: "3.0",
    date: "2025-03-27",
    statements: [
      { topic: "methane_method", section: "6.3", text: "A quantification methodology for these sources is under development and will be included in the next revision of this Monitoring Plan (target: Q4 2025).", evidence: R.page("plan", 3, "under development", "section 6.3") },
      { topic: "tank_venting", section: "2", text: "Crude is stabilised and stored in two fixed-roof tanks (T-401A/B) fitted with pressure/vacuum vents before export by pipeline.", evidence: R.page("plan", 1, "fitted with pressure/vacuum vents", "section 2") },
      { topic: "tank_venting", section: "3", text: "Figure 1 marks the storage tanks with \"P/V vents to atmosphere\".", evidence: R.page("plan", 2, "P/V vents to atmosphere", "section 3, Figure 1") },
      { topic: "data_gap_procedure", section: "8.3", text: "Where a meter is unavailable, missing data are substituted with the average of the 30 days of valid data preceding the gap. Gaps are recorded in sheet H1 of the emissions report and notified to the Agency within 30 days.", evidence: R.page("plan", 4, "Where a meter is unavailable, missing data are substituted with the average of the 30 days of valid data preceding the gap.", "section 8.3") },
      { topic: "reconciliation_control", section: "8.2", text: "Monthly reconciliation of flare meter totals against the gas balance in the production allocation report. Deviations greater than 10% are investigated and documented.", evidence: R.page("plan", 4, "Deviations greater than 10% are investigated and documented.", "section 8.2") },
      { topic: "emission_factor_method", section: "5.2", text: "EF fuel gas SS-01: site-specific, calculated from the carbon content of the same quarterly samples (Tier 3).", evidence: R.page("plan", 3, "EF fuel gas SS-01 Site-specific: calculated from the carbon content of the same quarterly samples Tier 3", "section 5.2") },
      { topic: "meter_calibration", section: "7", text: "FT-3001, FT-5101 and FT-5102 are calibrated every 12 months by Gulfmetric Calibration Services LLC.", evidence: R.page("plan", 3, "12 months Gulfmetric Calibration", "section 7") },
    ],
  },
  coverLetter: {
    reference: "DEC/SDF/HSE/2026/0330",
    date: "2026-03-30",
    reportedTotalTco2e: 274896,
    declarations: [
      { claim: "complete_and_accurate", text: "We confirm that the enclosed report is complete and accurate, has been prepared in accordance with the approved Monitoring Plan (Rev 3.0) and the Agency's Technical Guidance, and covers all greenhouse gas emissions within the facility boundary.", evidence: R.page("cover", 1, "We confirm that the enclosed report is complete and accurate", "Declaration") },
      { claim: "no_data_gaps", text: "No data gaps occurred during the reporting period.", evidence: R.page("cover", 1, "No data gaps occurred during the reporting period.", "Declaration") },
      { claim: "verified", text: "Enclosure 3: verification statement KVS-25-117, Kestrel Verification Services LLC.", evidence: R.page("cover", 1, "Verification statement KVS-25-117, Kestrel Verification Services LLC", "Enclosures") },
    ],
  },
  extractedBy: "heuristic",
  warnings: ["No LDAR survey found in the submission."],
};

const review: ReviewFixture = {
  aiMode: "demo",
  narrativeSource: "cache",
  status: "non_compliant",
  riskScore: 88,
  riskBand: "critical",
  headline: "Non-compliant: a flare meter gap, missing methane sources and a wrong emission factor hide about 54,179 t CO2e (19.7%)",
  summary:
    "Southern Dunes CPF-2 reports 274,896 t CO2e, the lowest intensity in its peer set at 10.65 kg CO2e/boe. From June 2025 the HP flare meter was out of calibration and replaced by flat engineering estimates that sit 62.2% below the operator's own gas balance, five methane sources are not quantified, and the fuel gas uses an IPCC default factor labelled as site-specific. Corrected, emissions are about 329,075 t CO2e (12.74 kg CO2e/boe), in line with peers, and the qualified verification statement contradicts the operator's declarations.",
  findings,
  checks,
  metrics: {
    reportedTotalTco2e: 274896, co2T: 267496, ch4T: 264.3, productionMmboe: 25.82, intensityKgCo2ePerBoe: 10.65, ch4IntensityTPerMmboe: 10.2,
    peerMedianIntensity: 13.4, peerMinIntensity: 11.9, peerMaxIntensity: 16.2, intensityPercentile: 0, priorYearTotalTco2e: 302003,
    yoyTotalPct: -9.0, yoyProductionPct: 2.5, estimatedUnderReportingTco2e: 54179, estimatedUnderReportingPct: 19.7,
    correctedTotalTco2e: 329075, correctedIntensityKgCo2ePerBoe: 12.74,
  },
  recommendedAction: {
    primary: "request_clarification",
    alsoConsider: ["escalate_inspection"],
    rationale:
      "Require a corrected report within 30 days (TGD Step 5) that declares the FT-5101 data gap, quantifies M-04 to M-08 and applies the site-specific fuel gas factor, with a revised Monitoring Plan. The satellite signals, especially the 14 July flame-out, justify considering a site inspection (TGD Step 6).",
    responseDays: 30,
    ruleIds: ["EAD-TGD-CORRECTIONS", "EAD-TGD-MP-UPDATE", "EAD-TGD-INSPECTION", "DL11-2024-ART6-1"],
  },
  legalExposure: {
    text: "If not remedied, the breach of Article 6(1) exposes the operator to fines of AED 50,000 to AED 2,000,000 under Decree-Law 11/2024 Art. 15, doubled for a repeat within 2 years (Art. 16). EAD may also inspect the facility and publish the names of non-compliant facilities.",
    ruleIds: ["DL11-2024-ART6-1", "DL11-2024-ART15", "DL11-2024-ART16", "EAD-TGD-INSPECTION"],
  },
  aiObservations: [
    {
      id: "AI-01",
      title: "Monitoring Plan revision overdue on two counts",
      explanation:
        "Section 6.3 of the Monitoring Plan promised a methane quantification method in the next revision by Q4 2025, and section 8.3 requires a revision within 30 days once a meter is out of service for more than 30 days. FT-5101 was out from 1 June, yet Rev 3.0 of 27 March 2025 is still the plan applied in the report. Ask the operator for the revised plan and the date it was submitted to EAD.",
      evidence: [
        R.page("plan", 3, "(target: Q4 2025)", "section 6.3"),
        R.page("plan", 1, "3.0 27-Mar-2025 Annual update for RY2025; section 6.3 added (other methane sources)", "Revision history"),
        R.page("plan", 4, "this Monitoring Plan is revised and resubmitted to the Agency within 30 days of the change.", "section 8.3"),
      ],
      ruleIds: ["EAD-TGD-MP-UPDATE"],
      quotesVerified: true,
    },
  ],
  facts,
  stages: [
    { name: "ingest", status: "done", durationMs: 240, detail: "10 documents; workbook parsed (14 sheets)" },
    { name: "extract", status: "done", durationMs: 520, detail: "6 PDFs and 4 CSVs; facts extracted (heuristic)" },
    { name: "checks", status: "done", durationMs: 90, detail: "12 checks, 7 findings" },
    { name: "score", status: "done", durationMs: 12, detail: "Risk 88/100 (critical)" },
    { name: "narrative", status: "done", durationMs: 8, detail: "Cached AI narrative (demo mode)" },
  ],
};

export const SOUTH: FacilityFixture = {
  key: "south",
  submissionId: "DEC_Southern-Dunes-CPF2_RY2025",
  folder: "DEC_Southern-Dunes-CPF2_RY2025",
  code: "DEC-SDF-CPF2",
  shortName: "Southern Dunes CPF-2",
  shortNameAr: "الكثبان الجنوبية CPF-2",
  facilityNameAr: "المنشأة المركزية للمعالجة 2 في حقل الكثبان الجنوبية (CPF-2)",
  manager: { en: "Eng. Saeed Al Marzouqi", ar: "المهندس سعيد المرزوقي" },
  files: SOUTH_FILES,
  report: SOUTH_REPORT,
  review,
  letter: {
    findingTitlesAr: {
      "F-01": "عدم تقدير كميات انبعاثات الميثان من المصادر M-04 إلى M-08",
      "F-02": "فجوة بيانات غير مفصح عنها في عداد الشعلة عالية الضغط FT-5101",
      "F-03": "تعارض أحجام الشعلة المبلغ عنها مع ميزان الغاز الخاص بالمشغل",
      "F-04": "استخدام معامل انبعاث غير صحيح لغاز الوقود في تدفق المصدر SS-01",
      "F-05": "أدنى كثافة انبعاثات بين المنشآت المماثلة رغم ارتفاع الإنتاج",
      "F-06": "إشارات ميثان مرصودة بالأقمار الاصطناعية عند الشعلة ومنطقة الخزانات (بيانات محاكاة)",
      "F-07": "رأي تحقق متحفظ يتعارض مع إقرارات المشغل",
    },
    requests: [
      {
        en: "Declare the June to December 2025 data gap on HP flare meter FT-5101 in sheet H1, recalculate SS-02 using the substitution method in Monitoring Plan section 8.3 or the production gas balance (22,976,806 Sm3 flared by balance against 8,680,437 Sm3 reported), and confirm when FT-5101 was reinstated and recalibrated.",
        ar: "الإفصاح في الورقة H1 عن فجوة البيانات في عداد الشعلة عالية الضغط FT-5101 للفترة من يونيو إلى ديسمبر 2025، وإعادة احتساب تدفق المصدر SS-02 باستخدام طريقة الاستعاضة الواردة في البند 8.3 من خطة الرصد أو باستخدام ميزان الغاز الإنتاجي (22,976,806 متراً مكعباً قياسياً محروقة وفق الميزان مقابل 8,680,437 متراً مكعباً قياسياً مبلغاً عنها)، وتأكيد تاريخ إعادة تركيب العداد FT-5101 ومعايرته.",
      },
      {
        en: "Quantify methane emissions from sources M-04 to M-08 (crude storage tanks T-401A/B, TEG still vent U-250, pneumatic controllers, compressor seals K-201A/B and fugitive components) and submit a revised Monitoring Plan that covers all methane sources.",
        ar: "تقدير كميات انبعاثات الميثان من المصادر M-04 إلى M-08 (خزانات النفط الخام T-401A/B، وفتحة تنفيس وحدة التجفيف بالجلايكول U-250، وأجهزة التحكم الهوائية، وموانع تسرب الضواغط K-201A/B، والتسربات من مكونات المعدات)، وتقديم خطة رصد معدلة تشمل جميع مصادر الميثان.",
      },
      {
        en: "Apply the site-specific fuel gas emission factor from the 2025 laboratory analyses (56.96 t CO2/TJ) to SS-01 instead of the IPCC default of 56.1 t CO2/TJ, as required by Monitoring Plan section 5.2.",
        ar: "تطبيق معامل الانبعاث الخاص بالموقع لغاز الوقود المستخلص من التحاليل المخبرية لعام 2025 (56.96 طن ثاني أكسيد الكربون لكل تيراجول) على تدفق المصدر SS-01 بدلاً من القيمة الافتراضية البالغة 56.1 طن لكل تيراجول، وفقاً لما يقتضيه البند 5.2 من خطة الرصد.",
      },
      {
        en: "Explain the HP flare pilot flame-out on 14 July 2025 (12:05 to 18:35) and the methane signal at the tank farm on 19 October 2025, and quantify any methane vented.",
        ar: "تقديم إيضاح بشأن انطفاء لهب الإشعال في الشعلة عالية الضغط بتاريخ 14 يوليو 2025 (من الساعة 12:05 إلى 18:35)، وإشارة الميثان المرصودة عند منطقة الخزانات بتاريخ 19 أكتوبر 2025، مع تقدير كمية الميثان المنبعثة.",
      },
      {
        en: "Correct the operator declaration and sheet H1, which state that there were no data gaps and that the report was verified, and resubmit with an updated verification statement that covers all emission sources.",
        ar: "تصحيح إقرار المشغل والورقة H1 اللذين يفيدان بعدم وجود فجوات في البيانات وبأن التقرير قد تم التحقق منه، وإعادة تقديم التقرير مرفقاً ببيان تحقق محدث يشمل جميع مصادر الانبعاثات.",
      },
    ],
    inspection: [
      {
        en: "HP flare meter FT-5101: current status, calibration records and the engineering model used for HP flare volumes from 1 June to 31 December 2025.",
        ar: "عداد الشعلة عالية الضغط FT-5101: حالته الحالية وسجلات معايرته والنموذج الهندسي المستخدم لتقدير أحجام الشعلة عالية الضغط من 1 يونيو إلى 31 ديسمبر 2025.",
      },
      {
        en: "HP flare FL-501 pilot and alarm logs, including the flame-out on 14 July 2025 and the K-201B compressor trip on 2 August 2025.",
        ar: "سجلات لهب الإشعال والإنذارات للشعلة عالية الضغط FL-501، بما في ذلك انطفاء اللهب بتاريخ 14 يوليو 2025 وتوقف الضاغط K-201B بتاريخ 2 أغسطس 2025.",
      },
      {
        en: "Crude storage tanks T-401A/B and their pressure/vacuum vents, the TEG still vent U-250, compressor seals and pneumatic controllers, including the tank-farm signal on 19 October 2025.",
        ar: "خزانات النفط الخام T-401A/B وفتحات تنفيس الضغط والتفريغ الخاصة بها، وفتحة تنفيس وحدة التجفيف U-250، وموانع تسرب الضواغط وأجهزة التحكم الهوائية، بما في ذلك الإشارة المرصودة عند منطقة الخزانات بتاريخ 19 أكتوبر 2025.",
      },
      {
        en: "Production allocation and gas balance records, and evidence of the monthly flare reconciliation required by Monitoring Plan section 8.2.",
        ar: "سجلات توزيع الإنتاج وميزان الغاز، وما يثبت إجراء المطابقة الشهرية لأحجام الشعلة المطلوبة بموجب البند 8.2 من خطة الرصد.",
      },
    ],
  },
  ask: {
    flare: {
      answer:
        "From 1 June to 31 December 2025 the HP flare volumes in the report are not meter readings. The flare log switches to \"ENGINEERING ESTIMATE\" on 2025-06-01, the day after FT-5101's calibration expired, with flat values averaging 31,554 Sm3/d against 99,324 Sm3/d metered from January to May. Over the same months the operator's own gas balance shows 22,976,806 Sm3 flared against 8,680,437 Sm3 reported (62.2% lower), while January to May agree within 0.4%. The missing 14,296,369 Sm3 is about 39,447 t CO2e (35,283 t CO2 plus 148.7 t CH4).",
      citations: [
        R.rows("flareLog", EST_ROWS, "FT-5101 removed for recalibration (vendor backlog). HP flare volume estimated from engineering model until meter reinstated.", "hp_data_source"),
        R.rows("production", "2025-06..2025-12", undefined, "flared_by_balance_sm3"),
        R.sheet("D2_Calculation_Approach", "Jun..Dec", undefined, "(b) Monthly activity data"),
        R.page("calibration", 2, "Next calibration due 31 May 2025", "FT-5101"),
      ],
      ruleIds: ["EAD-TGD-DATA-GAPS", "EAD-TGD-COMPLETENESS", "EAD-TGD-MP-UPDATE"],
    },
    methane: {
      answer:
        "Only three methane sources are quantified (M-01 to M-03, 264.3 t CH4). The crude tanks and TEG still vent (M-04, M-05) are marked \"Not applicable\", and pneumatics, compressor seals and fugitives (M-06 to M-08) are \"Considered de minimis\" without any estimate. That conflicts with the operator's own description: sheet C2 says the tanks have pressure/vacuum vents, Figure 1 of the Monitoring Plan shows \"P/V vents to atmosphere\", and section 6.3 says the method is still under development. Using Eastern Dunes CPF-1's non-flare methane intensity (16.1 t CH4/MMboe), the missing sources are about 416 t CH4, or 11,648 t CO2e.",
      citations: [
        R.sheet("G_Methane", "M-04..M-08", "Not applicable: closed system."),
        R.sheet("C2_Facility_Description", "T-401A/B", "fitted with pressure/vacuum vents", "(a) Non-technical summary"),
        R.page("plan", 2, "P/V vents to atmosphere", "section 3, Figure 1"),
        R.page("plan", 3, "under development", "section 6.3"),
      ],
      ruleIds: ["EAD-TGD-COMPLETENESS", "EAD-TGD-CATEGORIES", "DL11-2024-ART6-1"],
    },
    calibration: {
      answer:
        "FT-3001 (fuel gas) and FT-5102 (LP flare) were calibrated in 2025 and remain valid. HP flare meter FT-5101 was last calibrated on 28 May 2024 (certificate GCS-CAL-24-0562) and was due by 31 May 2025. It was removed on 1 June 2025 and not reinstated during the year, yet sheet I still lists it as \"In service\" and sheet D1 claims Tier 2 metering for SS-02.",
      citations: [
        R.page("calibration", 2, "Next calibration due 31 May 2025", "FT-5101 certificate GCS-CAL-24-0562"),
        R.sheet("I_Management_QA", "FT-5101", "In service", "(c) Measuring instruments register"),
        R.rows("flareLog", "2025-06-01", "FT-5101 removed for recalibration (vendor backlog).", "event_notes"),
      ],
      ruleIds: ["EAD-TGD-TIERS", "EAD-TGD-DATA-GAPS", "EAD-TGD-MP-UPDATE"],
    },
    verification: {
      answer:
        "Kestrel's statement KVS-25-117 is a qualified opinion. The qualification rests on its finding F-03: HP flare volumes from 1 June to 31 December 2025 are uncorroborated engineering estimates. The verifier also excluded methane sources M-04 to M-08 from scope at the operator's request, and three findings remain open (F-01 emission factor, F-03 FT-5101, F-04 methane). The workbook (H1) records only \"Verified (see enclosed statement)\" and the cover letter declares no data gaps.",
      citations: [
        R.page("verification", 2, "Qualified opinion.", "section 5"),
        R.page("verification", 1, "were excluded from the scope of this verification at the request of the operator.", "section 1"),
        R.sheet("H1_Verification_Data_Gaps", "Verification outcome", "Verified (see enclosed statement)", "(b) Verification"),
        R.page("cover", 1, "No data gaps occurred during the reporting period.", "Declaration"),
      ],
      ruleIds: ["EAD-TGD-VERIFICATION", "EAD-TGD-CORRECTIONS"],
    },
    peer: {
      answer:
        "At 10.65 kg CO2e/boe Southern Dunes is the lowest of the eight onshore CPFs in the benchmark (the others range from 11.9 to 16.2, median 13.4). Its methane intensity is 10.2 t CH4/MMboe against 26.3 to 52.4 for peers. Year on year, total emissions fell 9.0% (302,003 to 274,896 t CO2e) while production rose 2.5%, and the flare streams alone fell 28,998 t CO2. Corrected for the flare gap, missing methane and emission factor, the facility would be at about 12.74 kg CO2e/boe, in line with its peers, so the low figure is explained by under-reporting rather than better performance. Peer data is simulated.",
      citations: [
        R.reference("peers", "Row AD-OG-0417 and peer rows", "AD-OG-0417"),
        R.reference("priorYear", "Rows AD-OG-0417, RY2024", "AD-OG-0417"),
        R.sheet("C2_Facility_Description", "TOTAL", undefined, "(f) Emissions summary"),
      ],
      ruleIds: ["EAD-TGD-COMPLETENESS"],
    },
    satellite: {
      answer:
        "There are three simulated detections. On 14 July 2025, 1,820 kg CH4/h at HP flare FL-501 at 13:31 local time, during the pilot flame-out logged from 12:05 to 18:35, so gas was likely vented unburnt while the report assumes 98% combustion. On 2 August, 940 kg CH4/h at FL-501 during the K-201B compressor trip. On 19 October, 710 kg CH4/h at tank farm T-401A/B with no logged event, which contradicts the \"closed system\" claim for the tanks. These are signals to investigate, not proof, and they support a site inspection.",
      citations: [
        R.reference("satellite", "Detections SIM-2025-0714-S1, SIM-2025-0802-S2, SIM-2025-1019-S3", "SIM-2025-0714-S1..SIM-2025-1019-S3"),
        R.rows("flareLog", "2025-07-14", "FLAME-OUT ALARM 12:05-18:35", "pilot_status"),
        R.rows("flareLog", "2025-08-02", "K-201B compressor trip 10:40-16:15; gas routed to HP flare.", "event_notes"),
        R.sheet("G_Methane", "M-04", "Not applicable: closed system."),
      ],
      ruleIds: ["EAD-TGD-INSPECTION", "EAD-TGD-COMPLETENESS"],
    },
    default: {
      answer:
        "Southern Dunes CPF-2 is assessed as non-compliant (risk 88/100). The main issues are an undeclared FT-5101 data gap with flare volumes 62.2% below the gas balance, five unquantified methane sources and an IPCC default emission factor presented as site-specific. Together they suggest about 54,179 t CO2e (19.7% of the reported total) is missing. The recommended action is a clarification request requiring a corrected report within 30 days, with a site inspection to consider. Ask about the flare, methane, calibration, verification, peers or satellite signals for detail.",
      citations: [
        R.rows("production", "2025-06..2025-12", undefined, "flared_by_balance_sm3"),
        R.sheet("G_Methane", "M-04..M-08", "Not applicable: closed system."),
        R.sheet("D2_Calculation_Approach", "SS-01", "AD Tier 3 / NCV Tier 3 / EF Tier 3", "(a) Annual calculation"),
      ],
      ruleIds: ["DL11-2024-ART6-1", "EAD-TGD-CORRECTIONS", "EAD-TGD-DATA-GAPS"],
    },
  },
};

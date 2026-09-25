import type { EmissionsReport, MethaneLine, MonthlyActivity, SourceStream, TechnicalUnit } from "@zerocarbon/shared";
import { docId, packageFiles, refBuilders } from "./refs";

export const EAST_FILES = packageFiles("DEC-EDF-CPF1", "4.0", true);
export const SOUTH_FILES = packageFiles("DEC-SDF-CPF2", "3.0", false);
export const EAST_REFS = refBuilders(EAST_FILES);
export const SOUTH_REFS = refBuilders(SOUTH_FILES);

const OPERATOR = {
  name: "Dunes Energy Company",
  nameAr: "شركة الكثبان للطاقة",
  licence: "CN-1049372",
  address: "Dunes Energy Tower, Al Maryah Island, PO Box 47120, Abu Dhabi, UAE",
};

const SECTOR_TEXT = "Oil & Gas: onshore crude oil production, separation, stabilisation, gas compression and dehydration";

const DECLARATION =
  "I declare that the information in this report is complete and accurate to the best of my knowledge, has been prepared in accordance with the approved Monitoring Plan and EAD's Technical Guidance for MRV, and that all emissions from the facility have been reported.";

const NOT_APPLICABLE = {
  E1_Emission_Sources_Measured:
    "Not applicable. No emission sources at the facility are monitored using a measurement-based methodology (no CEMS installed on covered sources).",
  E2_Measurement_Approach:
    "Not applicable. No emission sources at the facility are monitored using a measurement-based methodology (no CEMS installed on covered sources).",
  F_Fallback_Approach:
    "Not applicable. All source streams are monitored using the calculation-based methodology at the tiers stated in sheet D1. No fallback methodology has been applied during the reporting period.",
};

const summaryText = (field: string, since: number, cpf: string, tanks: string) =>
  `${field} Field Central Processing Facility ${cpf} (CPF-${cpf}) is an onshore oil processing facility in the ${field} Field, Al Dhafra Region, operated by Dunes Energy Company since ${since}. Well fluids are separated in HP and LP inlet separators. Crude is stabilised and stored in two fixed-roof tanks (T-401A/B) ${tanks} before export by pipeline. Associated gas is compressed by two gas-turbine-driven compressors (K-201A/B), dehydrated in a TEG unit (U-250) and exported as sales gas or reinjected. Power is generated on site by three gas turbine generators. Fuel gas is taken from the dehydrated gas stream. An HP and an LP flare handle relief, purge and upset gas. Diesel is used only for the emergency generator and fire water pumps. The facility boundary covers all equipment within the CPF fence; wells and flowlines are included, the export pipeline beyond the custody transfer meter is excluded (operated by a third party).`;

const units = (tankNote: string): TechnicalUnit[] => [
  { tag: "GTG-A/B/C", description: "Gas turbine generators", capacity: "3 x 24 MW", sourceStream: "SS-01 Fuel gas", inScope: true },
  { tag: "K-201A/B", description: "Gas compressors, gas-turbine driven", capacity: "2 x 11 MW", sourceStream: "SS-01 Fuel gas", inScope: true, notes: "Wet seals" },
  { tag: "H-101A/B", description: "Crude heaters (direct fired)", capacity: "2 x 18 MW(th)", sourceStream: "SS-01 Fuel gas", inScope: true },
  { tag: "FL-501", description: "HP flare", capacity: "Design 4.2 MMSm3/d", sourceStream: "SS-02 HP flare gas", inScope: true, notes: "Continuous pilot" },
  { tag: "FL-502", description: "LP flare", capacity: "Design 0.6 MMSm3/d", sourceStream: "SS-03 LP flare gas", inScope: true, notes: "Continuous pilot" },
  { tag: "EDG-1 / P-801A/B", description: "Emergency diesel generator, fire water pumps", capacity: "2.5 MW / 2 x 0.8 MW", sourceStream: "SS-04 Diesel", inScope: true, notes: "Standby" },
  { tag: "U-250", description: "TEG dehydration unit", capacity: "3.0 MMSm3/d", inScope: true, notes: "Still vent (methane source)" },
  { tag: "T-401A/B", description: "Crude storage tanks", capacity: "2 x 250,000 bbl", inScope: true, notes: tankNote },
];

const monthly = (ss01: number[], ss02: number[], ss03: number[]): MonthlyActivity[] =>
  ss01.map((v, i) => ({ month: `2025-${String(i + 1).padStart(2, "0")}`, byStream: { "SS-01": v, "SS-02": ss02[i], "SS-03": ss03[i] } }));

interface StreamValues {
  fuel: { sm3: number; ncv: number; tj: number; ef: number; co2: number };
  hp: { sm3: number; co2: number };
  lp: { sm3: number; co2: number };
  flareEf: number;
  diesel: { t: number; tj: number; co2: number };
}

function streams(v: StreamValues, ref: typeof EAST_REFS): SourceStream[] {
  const flare = (id: string, name: string, category: string, tag: string, s: { sm3: number; co2: number }, dataSource: string): SourceStream => ({
    id, name, type: "Flaring", category, meterTag: tag, measurement: `${tag} ultrasonic flare gas meter`, activityTier: "Tier 2", maxUncertainty: "+/-5.0%",
    factorsBasis: "EF from quarterly GC of flare header gas (Tier 3)", activity: s.sm3, activityUnit: "Sm3", emissionFactor: v.flareEf,
    emissionFactorUnit: "t CO2/10^3 Sm3", oxidationFactor: "CE 0.98 in EF", co2T: s.co2, tiers: "AD Tier 2 / EF Tier 3", dataSource, evidence: ref.sheet("D2_Calculation_Approach", id),
  });
  return [
    {
      id: "SS-01", name: "Fuel gas", type: "Combustion", category: "Major", meterTag: "FT-3001", measurement: "FT-3001 ultrasonic meter, fuel gas header",
      activityTier: "Tier 3", maxUncertainty: "+/-2.5%", factorsBasis: "NCV and EF from quarterly GC analysis (site-specific, Tier 3)",
      activity: v.fuel.sm3, activityUnit: "Sm3", ncv: v.fuel.ncv, ncvUnit: "MJ/Sm3", energyTj: v.fuel.tj, emissionFactor: v.fuel.ef, emissionFactorUnit: "t CO2/TJ",
      oxidationFactor: 1, co2T: v.fuel.co2, tiers: "AD Tier 3 / NCV Tier 3 / EF Tier 3", dataSource: "FT-3001; NCV and EF site-specific from quarterly GC analysis",
      evidence: ref.sheet("D2_Calculation_Approach", "SS-01"),
    },
    flare("SS-02", "HP flare gas", "Major", "FT-5101", v.hp, "FT-5101; EF from quarterly GC of flare header gas"),
    flare("SS-03", "LP flare gas", "Minor", "FT-5102", v.lp, "FT-5102; EF as SS-02"),
    {
      id: "SS-04", name: "Diesel", type: "Combustion", category: "De-minimis", measurement: "Supplier invoices and tank dips", activityTier: "Tier 1",
      maxUncertainty: "+/-7.5%", factorsBasis: "IPCC 2006 defaults", activity: v.diesel.t, activityUnit: "t", ncv: 43, ncvUnit: "GJ/t", energyTj: v.diesel.tj,
      emissionFactor: 74.1, emissionFactorUnit: "t CO2/TJ", oxidationFactor: 1, co2T: v.diesel.co2, tiers: "AD Tier 1 / NCV, EF IPCC default",
      dataSource: "Supplier invoices + stock change (see (c))", evidence: ref.sheet("D2_Calculation_Approach", "SS-04"),
    },
  ];
}

type Line = [id: string, source: string, category: string, method: string, basis: string, ch4: number | null, co2e: number | null, note: string, status: MethaneLine["status"]];

const methane = (lines: Line[], ref: typeof EAST_REFS): MethaneLine[] =>
  lines.map(([id, source, category, method, basis, ch4T, co2eT, note, status]) => ({
    id, source, category, method, basis, ch4T, gwp: ch4T === null ? null : 28, co2eT, note, status, evidence: ref.sheet("G_Methane", id),
  }));

const COMBUSTION_M02 = "Fuel gas combustion (GTG-A/B/C, K-201A/B drivers, H-101A/B)";
const COMBUSTION_M03 = "Diesel combustion (EDG-1, P-801A/B)";
const FLARE_M01 = "Flare combustion slip (FL-501, FL-502)";
const FLARE_METHOD = "Flare volume x CH4 content x (1 - 0.98 combustion efficiency)";
const FLARE_NOTE = "Composition from quarterly GC analysis of flare header gas.";

const instruments = (ref: typeof EAST_REFS, rows: [tag: string, last: string, next: string, cert: string, status: string][]) => {
  const meta: Record<string, { service: string; type: string; tier: string }> = {
    "FT-3001": { service: "Fuel gas header", type: "Ultrasonic, 4-path, DN300", tier: "Tier 3" },
    "FT-5101": { service: "HP flare header", type: "Ultrasonic flare gas meter, 2-path, DN600", tier: "Tier 2" },
    "FT-5102": { service: "LP flare header", type: "Ultrasonic flare gas meter, 2-path, DN300", tier: "Tier 2" },
  };
  return rows.map(([tag, lastCalibration, nextDue, certificate, status]) => ({
    tag, ...meta[tag], lastCalibration, nextDue, certificate, status, evidence: ref.sheet("I_Management_QA", tag, status, "(c) Measuring instruments register"),
  }));
};

export const SOUTH_REPORT: EmissionsReport = {
  documentId: docId(SOUTH_FILES.xlsx),
  templateName: "EAD Facility-Level MRV Reporting Template: Annual Emissions Report",
  operator: OPERATOR,
  facility: {
    name: "Southern Dunes Field Central Processing Facility 2 (CPF-2)", eadId: "AD-OG-0417", permit: "EP-2020-01873", sector: "oil_and_gas",
    sectorText: SECTOR_TEXT, location: "Southern Dunes Field, Al Dhafra Region, Emirate of Abu Dhabi", emirate: "Abu Dhabi", lat: 22.814, lon: 54.1375, startYear: 2012,
  },
  reportingYear: 2025,
  period: { start: "2025-01-01", end: "2025-12-31" },
  monitoringPlan: { reference: "DEC-SDF-CPF2-HSE-MP-001", revision: "3.0", date: "2025-03-27" },
  submittedOn: "2026-03-30",
  contacts: { ghgLead: "Hind Al Shamsi, GHG & Energy Lead", email: "hind.alshamsi@dunesenergy.example", phone: "+971 2 555 0417", facilityManager: "Eng. Saeed Al Marzouqi" },
  declaration: { text: DECLARATION, signedBy: "Eng. Saeed Al Marzouqi, Facility Manager", date: "2026-03-30", evidence: SOUTH_REFS.sheet("C1_Identifiers", undefined, DECLARATION.split(",")[0], "(e) Operator declaration") },
  summaryText: summaryText("Southern Dunes", 2012, "2", "fitted with pressure/vacuum vents"),
  technicalUnits: units("Tank vents"),
  dynamicData: {
    "Crude oil produced (bbl)": 23285781, "Average crude rate (bbl/d)": 63797, "Sales gas exported (Sm3)": 416190632, "Sales gas exported (boe, 5,800 scf/boe)": 2534079,
    "Total hydrocarbon production (MMboe)": 25.82, "Fuel gas consumed (Sm3)": 98642317, "Gas flared (Sm3)": 25050372, "Diesel consumed (t)": 1418.6, "Operating hours": 8760,
  },
  production: { oilBbl: 23285781, gasExportedSm3: 416190632, gasExportedBoe: 2534079, mmboe: 25.82 },
  approaches: { calculation: true, measurement: false, fallback: false, methane: true },
  sourceStreams: streams(
    {
      fuel: { sm3: 98642317, ncv: 36.35, tj: 3585.6, ef: 56.1, co2: 201152 }, hp: { sm3: 21750497, co2: 53680 }, lp: { sm3: 3299875, co2: 8144 },
      flareEf: 2.468, diesel: { t: 1418.6, tj: 61, co2: 4520 },
    },
    SOUTH_REFS,
  ),
  monthly: monthly(
    [8127075, 7777205, 8447849, 8114671, 8376106, 7723418, 8339704, 8545698, 7891674, 8557528, 7919653, 8821736],
    [2998349, 2906255, 3003091, 2906342, 3183960, 945000, 992000, 988000, 975000, 976500, 915000, 961000],
    [286301, 245050, 275228, 283581, 281778, 256412, 286413, 291502, 268260, 279654, 265189, 280507],
  ),
  dieselStock: { openingT: 38.2, deliveriesT: 1421.9, closingT: 41.5, consumptionT: 1418.6 },
  methane: methane(
    [
      ["M-01", FLARE_M01, "Incomplete combustion", FLARE_METHOD, "25,050,372 Sm3 flared x 0.0104 t CH4/10^3 Sm3", 260.5, 7294, FLARE_NOTE, "quantified"],
      ["M-02", COMBUSTION_M02, "Combustion", "IPCC 2006 Tier 1 factor, 1 kg CH4/TJ", "3,585.6 TJ", 3.6, 101, "", "quantified"],
      ["M-03", COMBUSTION_M03, "Combustion", "IPCC 2006 Tier 1 factor, 3 kg CH4/TJ", "61.00 TJ", 0.2, 6, "", "quantified"],
      ["M-04", "Crude storage tanks T-401A/B (flashing, working and breathing)", "Venting", "Not applicable", "Closed system (no venting)", null, null, "Not applicable: closed system.", "not_applicable"],
      ["M-05", "TEG dehydration unit U-250 still vent", "Venting", "Not applicable", "", null, null, "Not applicable.", "not_applicable"],
      ["M-06", "Gas-driven pneumatic controllers", "Venting", "Not quantified", "", null, null, "Considered de minimis.", "not_quantified"],
      ["M-07", "Compressor seals K-201A/B", "Venting", "Not quantified", "", null, null, "Considered de minimis.", "not_quantified"],
      ["M-08", "Fugitive components (valves, flanges, connectors)", "Fugitive", "Not quantified", "", null, null, "Considered de minimis. LDAR programme planned for 2026.", "not_quantified"],
      ["M-09", "Maintenance blowdowns / depressurisation", "Venting", "Event log", "No vented events recorded", 0, 0, "None recorded.", "zero"],
    ],
    SOUTH_REFS,
  ),
  totals: { co2T: 267496, ch4T: 264.3, ch4Co2eT: 7400, totalCo2eT: 274896, gwpCh4: 28, intensityKgCo2ePerBoe: 10.65 },
  dataGaps: [],
  dataGapsDeclaredNone: true,
  verification: {
    body: "Kestrel Verification Services LLC", reference: "KVS-25-117", date: "2026-03-24", assurance: "Reasonable", outcome: "Verified (see enclosed statement)",
    siteVisit: "2025-11-12", evidence: SOUTH_REFS.sheet("H1_Verification_Data_Gaps", "Verification outcome", "Verified (see enclosed statement)"),
  },
  instruments: instruments(SOUTH_REFS, [
    ["FT-3001", "2025-01-18", "2026-01-31", "GCS-CAL-25-0117", "In service"],
    ["FT-5101", "2024-05-28", "2025-05-31", "GCS-CAL-24-0562", "In service"],
    ["FT-5102", "2025-02-10", "2026-02-28", "GCS-CAL-25-0188", "In service"],
  ]),
  mitigation: [
    { id: "MM-01", measure: "GTG-A hot gas path upgrade (efficiency improvement)", type: "Energy efficiency", status: "Implemented", year: 2025, reductionTco2ePerYear: 2100, notes: "Commissioned November 2025." },
    { id: "MM-02", measure: "Flare gas recovery unit (FGRU) on HP flare header", type: "Flaring reduction", status: "Planned (FEED)", year: 2026, reductionTco2ePerYear: 45000, notes: "FEED study to start Q2 2026." },
    { id: "MM-03", measure: "Leak detection and repair (LDAR) programme", type: "Methane", status: "Planned", year: 2026, reductionTco2ePerYear: null, notes: "Scope under definition." },
  ],
  notApplicableSheets: NOT_APPLICABLE,
  warnings: [],
};

export const EAST_REPORT: EmissionsReport = {
  documentId: docId(EAST_FILES.xlsx),
  templateName: "EAD Facility-Level MRV Reporting Template: Annual Emissions Report",
  operator: OPERATOR,
  facility: {
    name: "Eastern Dunes Field Central Processing Facility 1 (CPF-1)", eadId: "AD-OG-0412", permit: "EP-2019-00944", sector: "oil_and_gas",
    sectorText: SECTOR_TEXT, location: "Eastern Dunes Field, Al Dhafra Region, Emirate of Abu Dhabi", emirate: "Abu Dhabi", lat: 23.052, lon: 54.618, startYear: 2009,
  },
  reportingYear: 2025,
  period: { start: "2025-01-01", end: "2025-12-31" },
  monitoringPlan: { reference: "DEC-EDF-CPF1-HSE-MP-001", revision: "4.0", date: "2025-03-20" },
  submittedOn: "2026-03-18",
  contacts: { ghgLead: "Dr. Priya Nair, GHG & Energy Lead", email: "priya.nair@dunesenergy.example", phone: "+971 2 555 0412", facilityManager: "Eng. Rashed Al Neyadi" },
  declaration: { text: DECLARATION, signedBy: "Eng. Rashed Al Neyadi, Facility Manager", date: "2026-03-18", evidence: EAST_REFS.sheet("C1_Identifiers", undefined, DECLARATION.split(",")[0], "(e) Operator declaration") },
  summaryText: summaryText("Eastern Dunes", 2009, "1", "whose vapours are recovered by VRU-401"),
  technicalUnits: [
    ...units("Vapours to VRU-401"),
    { tag: "VRU-401", description: "Vapour recovery unit (electric)", capacity: "0.25 MMSm3/d", inScope: true, notes: "Installed 2023" },
  ],
  dynamicData: {
    "Crude oil produced (bbl)": 17203782, "Average crude rate (bbl/d)": 47134, "Sales gas exported (Sm3)": 328855825, "Sales gas exported (boe, 5,800 scf/boe)": 2002319,
    "Total hydrocarbon production (MMboe)": 19.21, "Fuel gas consumed (Sm3)": 76208954, "Gas flared (Sm3)": 27304591, "Diesel consumed (t)": 1047.3, "Operating hours": 8760,
  },
  production: { oilBbl: 17203782, gasExportedSm3: 328855825, gasExportedBoe: 2002319, mmboe: 19.21 },
  approaches: { calculation: true, measurement: false, fallback: false, methane: true },
  sourceStreams: streams(
    {
      fuel: { sm3: 76208954, ncv: 36.12, tj: 2752.7, ef: 56.86, co2: 156519 }, hp: { sm3: 24735765, co2: 59786 }, lp: { sm3: 2568826, co2: 6209 },
      flareEf: 2.417, diesel: { t: 1047.3, tj: 45.03, co2: 3337 },
    },
    EAST_REFS,
  ),
  monthly: monthly(
    [6659944, 6035278, 6062573, 6199296, 6545620, 6241886, 6647875, 6638948, 6227495, 6588659, 6093561, 6267819],
    [2080283, 1889552, 2170209, 2000579, 2182048, 2058725, 2032753, 2109087, 2024757, 2084046, 2000376, 2103350],
    [219955, 206745, 226533, 216042, 204132, 207888, 223417, 211177, 202901, 219033, 211996, 219007],
  ),
  dieselStock: { openingT: 29.4, deliveriesT: 1045.8, closingT: 27.9, consumptionT: 1047.3 },
  methane: methane(
    [
      ["M-01", FLARE_M01, "Incomplete combustion", FLARE_METHOD, "27,304,591 Sm3 flared x 0.0106 t CH4/10^3 Sm3", 289.4, 8103, FLARE_NOTE, "quantified"],
      ["M-02", COMBUSTION_M02, "Combustion", "IPCC 2006 Tier 1 factor, 1 kg CH4/TJ", "2,752.7 TJ", 2.8, 78, "", "quantified"],
      ["M-03", COMBUSTION_M03, "Combustion", "IPCC 2006 Tier 1 factor, 3 kg CH4/TJ", "45.03 TJ", 0.1, 3, "", "quantified"],
      ["M-04", "Crude storage tanks T-401A/B (flashing, working and breathing)", "Venting", "Process simulation (Peng-Robinson) of separator-to-tank flash + VRU availability",
        "Uncontrolled 3,012 t CH4 x (1 - 96.8% VRU-401 availability)", 96.4, 2699, "VRU-401 downtime from maintenance log (280 h).", "quantified"],
      ["M-05", "TEG dehydration unit U-250 still vent", "Venting", "GRI-GLYCalc v4 with measured lean/rich TEG circulation", "Annual average operating conditions", 58.2, 1630,
        "Still vent condenser in service all year.", "quantified"],
      ["M-06", "Gas-driven pneumatic controllers", "Venting", "Device inventory x device-specific bleed factor (2024 bleed-rate survey)",
        "12 intermittent-bleed level controllers x 1.75 t/yr; 30 low-bleed valve positioners x 0.335 t/yr", 31.1, 871, "All other controllers on instrument air since 2024.", "quantified"],
      ["M-07", "Compressor wet seals K-201A/B (degassing vents)", "Venting", "Quarterly measurement of seal-oil degassing vent flow and CH4 content",
        "2 compressors x 62 kg CH4/day x 365 days", 45.3, 1268, "", "quantified"],
      ["M-08", "Fugitive components (valves, flanges, connectors)", "Fugitive", "Quarterly OGI LDAR survey, Hi-Flow quantification of detected leaks",
        "See LDAR survey summary 2025", 74, 2072, "101 leaks detected, 100 repaired.", "quantified"],
      ["M-09", "Maintenance blowdowns / depressurisation (vent stack V-210)", "Venting", "Vented volume from pressure/volume calculation x CH4 content",
        "3 events, 7,900 Sm3 x 0.5283 t CH4/10^3 Sm3", 4.2, 118, "Events logged under PTW-25-0418, -0733, -1102.", "quantified"],
    ],
    EAST_REFS,
  ),
  totals: { co2T: 225851, ch4T: 601.5, ch4Co2eT: 16842, totalCo2eT: 242693, gwpCh4: 28, intensityKgCo2ePerBoe: 12.63 },
  dataGaps: [
    {
      sourceStream: "SS-03 LP flare gas",
      period: "11-13 Mar 2025 (3 days)",
      cause: "FT-5102 transducer fault; meter offline until transducer replaced and recalibrated on 14-Mar-2025.",
      substitutionMethod: "Average of the preceding 30 days of metered data (Monitoring Plan section 8.3). EAD notified 02-Apr-2025.",
      impactTco2e: 58,
      evidence: EAST_REFS.sheet("H1_Verification_Data_Gaps", "SS-03 LP flare gas", "11-13 Mar 2025 (3 days)"),
    },
  ],
  dataGapsDeclaredNone: false,
  verification: {
    body: "Kestrel Verification Services LLC", reference: "KVS-25-094", date: "2026-03-10", assurance: "Reasonable",
    outcome: "Verified: unmodified opinion (see enclosed statement)", siteVisit: "2025-09-23",
    evidence: EAST_REFS.sheet("H1_Verification_Data_Gaps", "Verification outcome", "Verified: unmodified opinion (see enclosed statement)"),
  },
  instruments: instruments(EAST_REFS, [
    ["FT-3001", "2025-01-22", "2026-01-31", "GCS-CAL-25-0131", "In service"],
    ["FT-5101", "2025-02-04", "2026-02-28", "GCS-CAL-25-0152", "In service"],
    ["FT-5102", "2025-03-14", "2026-03-31", "GCS-CAL-25-0276", "In service (transducer replaced 14-Mar-2025)"],
  ]),
  mitigation: [
    { id: "MM-01", measure: "Vapour recovery unit VRU-401 on crude storage tanks", type: "Methane", status: "Implemented", year: 2023, reductionTco2ePerYear: 80000, notes: "Recovers tank flash gas to LP compression." },
    { id: "MM-02", measure: "Quarterly OGI leak detection and repair (LDAR)", type: "Methane", status: "Implemented", year: 2024, reductionTco2ePerYear: 3500, notes: "Repairs within 15 days of detection." },
    { id: "MM-03", measure: "Conversion of 118 pneumatic controllers to instrument air", type: "Methane", status: "Implemented", year: 2024, reductionTco2ePerYear: 5900, notes: "42 low/intermittent-bleed devices remain on gas." },
    { id: "MM-04", measure: "Flare gas recovery unit (FGRU) on HP flare header", type: "Flaring reduction", status: "Planned (EPC award)", year: 2027, reductionTco2ePerYear: 38000, notes: "Final investment decision taken Dec 2025." },
  ],
  notApplicableSheets: NOT_APPLICABLE,
  warnings: [],
};

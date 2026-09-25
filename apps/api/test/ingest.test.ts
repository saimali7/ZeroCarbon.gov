import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { strToU8, zipSync } from "fflate";
import type { EmissionsReport, SubmissionDocument } from "@zerocarbon/shared";
import { config } from "../src/config.ts";
import { classifyDocument } from "../src/ingest/classify.ts";
import { findDates, isEadWorkbook, parseEadWorkbook, toIsoDate } from "../src/ingest/ead-workbook.ts";
import { parseEvidenceCsv } from "../src/ingest/evidence.ts";
import { loadSubmissionPackage, readPackageSummary, slugify } from "../src/ingest/package.ts";
import { readXlsx, sheetToText } from "../src/ingest/xlsx.ts";
import { loadReferenceData } from "../src/reference/reference.ts";

const SUBMISSIONS = path.join(config.dataDir, "submissions");
const SOUTH = path.join(SUBMISSIONS, "DEC_Southern-Dunes-CPF2_RY2025");
const EAST = path.join(SUBMISSIONS, "DEC_Eastern-Dunes-CPF1_RY2025");
const REGULATOR = path.join(config.dataDir, "regulator-reference-SIMULATED");

function doc(fileName: string, kind: SubmissionDocument["kind"] = "other"): SubmissionDocument {
  return { id: slugify(fileName.replace(/\.[^.]+$/, "")), fileName, relativePath: fileName, kind, mediaType: "", sizeBytes: 0, sha256: "" };
}

async function report(dir: string, prefix: string): Promise<EmissionsReport> {
  const fileName = `${prefix}_EAD-MRV-Emissions-Report_RY2025.xlsx`;
  const workbook = readXlsx(await readFile(path.join(dir, fileName)));
  assert.ok(isEadWorkbook(workbook));
  return parseEadWorkbook(workbook, doc(fileName, "emissions_report"));
}

const csv = (dir: string, name: string) => readFile(path.join(dir, "evidence", name), "utf8");

test("readXlsx: shared strings, rich text, entities, inline strings, booleans, errors, relative targets", () => {
  const xml = (s: string) => strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${s}`);
  const zip = zipSync({
    "xl/workbook.xml": xml(
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data &amp; More" sheetId="1" r:id="rId7"/><sheet name="Second" sheetId="2" r:id="rId8"/></sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": xml(
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId7" Type="worksheet" Target="worksheets/data.xml"/><Relationship Id="rId8" Type="worksheet" Target="/xl/worksheets/second.xml"/></Relationships>`,
    ),
    "xl/sharedStrings.xml": xml(
      `<sst count="3" uniqueCount="3"><si><t>Plain &lt;tag&gt; &#65;&#x42;</t></si><si><r><rPr><b/></rPr><t xml:space="preserve">Rich </t></r><r><t>text</t></r><rPh><t>ignored</t></rPh></si><si><t xml:space="preserve">  padded  </t></si></sst>`,
    ),
    "xl/worksheets/data.xml": xml(
      `<worksheet><sheetData><row r="2"><c r="A2" t="s"><v>0</v></c><c r="C2" t="s"><v>1</v></c></row><row r="5"><c r="B5"><v>12.5</v></c><c r="C5" t="b"><v>1</v></c><c r="D5" t="e"><v>#N/A</v></c><c r="E5" t="str"><f>A1</f><v>calc &quot;x&quot;</v></c><c r="F5" t="inlineStr"><is><t>inline &apos;y&apos;</t></is></c></row><row r="6"><c r="AA6" t="s"><v>2</v></c></row></sheetData></worksheet>`,
    ),
    "xl/worksheets/second.xml": xml(`<worksheet><sheetData><row r="1"><c r="A1" t="n"><v>-3</v></c></row></sheetData></worksheet>`),
  });
  const wb = readXlsx(zip);
  assert.deepEqual(
    wb.sheets.map((s) => s.name),
    ["Data & More", "Second"],
  );
  const [data, second] = wb.sheets;
  assert.deepEqual(data.rows[0], { rowNumber: 2, cells: ["Plain <tag> AB", null, "Rich text"] });
  assert.deepEqual(data.rows[1], { rowNumber: 5, cells: [null, 12.5, true, "#N/A", 'calc "x"', "inline 'y'"] });
  assert.equal(data.rows[2].cells[26], "  padded  ");
  assert.deepEqual(second.rows, [{ rowNumber: 1, cells: [-3] }]);
  assert.match(sheetToText(data), /^### Sheet Data & More\n2: Plain <tag> AB \| Rich text\n5: 12\.5 \| true/);
});

test("date helpers normalise workbook formats", () => {
  assert.equal(toIsoDate("30 Mar 2026"), "2026-03-30");
  assert.equal(toIsoDate("01-Jan-2025"), "2025-01-01");
  assert.equal(toIsoDate("18-Jan-2025"), "2025-01-18");
  assert.equal(toIsoDate("2025-06-01"), "2025-06-01");
  assert.equal(toIsoDate(45658), "2025-01-01");
  assert.equal(toIsoDate("n/a"), undefined);
  assert.deepEqual(findDates("01-Jan-2025 to 31-Dec-2025"), ["2025-01-01", "2025-12-31"]);
  assert.deepEqual(findDates("KVS-25-117, dated 24 Mar 2026"), ["2026-03-24"]);
});

test("South workbook: identifiers, period and declaration", async () => {
  const r = await report(SOUTH, "DEC-SDF-CPF2");
  assert.deepEqual(r.warnings, []);
  assert.equal(r.facility.eadId, "AD-OG-0417");
  assert.equal(r.facility.permit, "EP-2020-01873");
  assert.equal(r.facility.sector, "oil_and_gas");
  assert.match(r.facility.sectorText ?? "", /^Oil & Gas:/);
  assert.equal(r.facility.emirate, "Abu Dhabi");
  assert.equal(r.facility.lat, 22.814);
  assert.equal(r.facility.lon, 54.1375);
  assert.equal(r.facility.startYear, 2012);
  assert.equal(r.operator.name, "Dunes Energy Company");
  assert.equal(r.operator.nameAr, "شركة الكثبان للطاقة");
  assert.equal(r.reportingYear, 2025);
  assert.deepEqual(r.period, { start: "2025-01-01", end: "2025-12-31" });
  assert.equal(r.submittedOn, "2026-03-30");
  assert.deepEqual(r.monitoringPlan, { reference: "DEC-SDF-CPF2-HSE-MP-001", revision: "3.0", date: "2025-03-27" });
  assert.equal(r.contacts?.email, "hind.alshamsi@dunesenergy.example");
  assert.match(r.declaration?.text ?? "", /complete and accurate/);
  assert.equal(r.declaration?.date, "2026-03-30");
  assert.match(r.declaration?.signedBy ?? "", /Saeed Al Marzouqi/);
  assert.equal(r.declaration?.evidence.sheet, "C1_Identifiers");
  assert.match(r.summaryText ?? "", /pressure\/vacuum vents/);
  assert.equal(r.templateName, "EAD Facility-Level MRV Reporting Template: Annual Emissions Report");
  assert.deepEqual(r.approaches, { calculation: true, measurement: false, fallback: false, methane: true });
  assert.equal(Object.keys(r.notApplicableSheets).length, 3);
  assert.match(r.notApplicableSheets.F_Fallback_Approach, /^Not applicable/);
});

test("South workbook: source streams, monthly data and diesel stock", async () => {
  const r = await report(SOUTH, "DEC-SDF-CPF2");
  assert.deepEqual(
    r.sourceStreams.map((s) => s.id),
    ["SS-01", "SS-02", "SS-03", "SS-04"],
  );
  const [ss1, ss2, ss3, ss4] = r.sourceStreams;
  assert.equal(ss1.activity, 98642317);
  assert.equal(ss1.activityUnit, "Sm3");
  assert.equal(ss1.ncv, 36.35);
  assert.equal(ss1.emissionFactor, 56.1);
  assert.equal(ss1.emissionFactorUnit, "t CO2/TJ");
  assert.equal(ss1.co2T, 201152);
  assert.equal(ss1.category, "Major");
  assert.equal(ss1.meterTag, "FT-3001");
  assert.equal(ss1.oxidationFactor, 1);
  assert.match(ss1.factorsBasis ?? "", /site-specific, Tier 3/);
  assert.deepEqual(ss1.evidence, {
    documentId: "dec-sdf-cpf2-ead-mrv-emissions-report-ry2025",
    fileName: "DEC-SDF-CPF2_EAD-MRV-Emissions-Report_RY2025.xlsx",
    sheet: "D2_Calculation_Approach",
    rows: "SS-01",
    locator: "Sheet D2_Calculation_Approach, row 6 (SS-01)",
  });
  assert.equal(ss2.activity, 21750497);
  assert.equal(ss2.emissionFactor, 2.468);
  assert.equal(ss2.co2T, 53680);
  assert.equal(ss2.meterTag, "FT-5101");
  assert.equal(ss2.activityTier, "Tier 2");
  assert.equal(ss2.type, "Flaring");
  assert.equal(ss2.ncv, undefined);
  assert.equal(ss2.oxidationFactor, "CE 0.98 in EF");
  assert.equal(ss3.activity, 3299875);
  assert.equal(ss3.meterTag, "FT-5102");
  assert.equal(ss3.category, "Minor");
  assert.equal(ss4.activity, 1418.6);
  assert.equal(ss4.activityUnit, "t");
  assert.equal(ss4.meterTag, undefined);

  assert.equal(r.monthly.length, 12);
  assert.equal(r.monthly[0].month, "2025-01");
  assert.equal(r.monthly.find((m) => m.month === "2025-06")?.byStream["SS-02"], 945000);
  assert.equal(
    r.monthly.reduce((sum, m) => sum + m.byStream["SS-01"], 0),
    98642317,
  );
  assert.deepEqual(r.dieselStock, { openingT: 38.2, deliveriesT: 1421.9, closingT: 41.5, consumptionT: 1418.6 });
});

test("South workbook: methane, totals, production, gaps, verification, instruments", async () => {
  const r = await report(SOUTH, "DEC-SDF-CPF2");
  const line = (id: string) => r.methane.find((m) => m.id === id)!;
  assert.equal(r.methane.length, 9);
  assert.equal(line("M-01").ch4T, 260.5);
  assert.equal(line("M-01").status, "quantified");
  assert.equal(line("M-01").evidence.locator, "Sheet G_Methane, row 5 (M-01)");
  for (const id of ["M-04", "M-05"]) assert.equal(line(id).status, "not_applicable");
  for (const id of ["M-06", "M-07", "M-08"]) assert.equal(line(id).status, "not_quantified");
  assert.equal(line("M-04").ch4T, null);
  assert.equal(line("M-09").status, "zero");
  assert.equal(line("M-09").ch4T, 0);

  assert.deepEqual(r.totals, { co2T: 267496, ch4T: 264.3, ch4Co2eT: 7400, totalCo2eT: 274896, gwpCh4: 28, intensityKgCo2ePerBoe: 10.65 });
  assert.equal(r.production?.mmboe, 25.82);
  assert.equal(r.production?.oilBbl, 23285781);
  assert.equal(r.production?.gasExportedSm3, 416190632);
  assert.equal(r.production?.gasExportedBoe, 2534079);
  assert.equal(r.dynamicData["Gas flared (Sm3)"], 25050372);

  assert.equal(r.dataGapsDeclaredNone, true);
  assert.deepEqual(r.dataGaps, []);
  assert.equal(r.verification.outcome, "Verified (see enclosed statement)");
  assert.equal(r.verification.reference, "KVS-25-117");
  assert.equal(r.verification.date, "2026-03-24");
  assert.equal(r.verification.body, "Kestrel Verification Services LLC");
  assert.equal(r.verification.assurance, "Reasonable");
  assert.equal(r.verification.siteVisit, "2025-11-12");
  assert.equal(r.verification.evidence?.sheet, "H1_Verification_Data_Gaps");

  const ft5101 = r.instruments.find((i) => i.tag === "FT-5101");
  assert.equal(ft5101?.lastCalibration, "2024-05-28");
  assert.equal(ft5101?.nextDue, "2025-05-31");
  assert.equal(ft5101?.status, "In service");
  assert.equal(ft5101?.certificate, "GCS-CAL-24-0562");
  assert.equal(r.instruments.length, 3);

  const tanks = r.technicalUnits.find((u) => u.tag === "T-401A/B");
  assert.equal(tanks?.notes, "Tank vents");
  assert.equal(tanks?.inScope, true);
  assert.equal(r.technicalUnits.find((u) => u.tag === "FL-501")?.sourceStream, "SS-02 HP flare gas");

  assert.equal(r.mitigation.length, 3);
  assert.equal(r.mitigation[0].reductionTco2ePerYear, 2100);
  assert.equal(r.mitigation[2].reductionTco2ePerYear, null);
  assert.equal(r.mitigation[0].year, 2025);
});

test("East workbook: totals, all methane quantified, declared data gap", async () => {
  const r = await report(EAST, "DEC-EDF-CPF1");
  assert.deepEqual(r.warnings, []);
  assert.equal(r.facility.eadId, "AD-OG-0412");
  assert.equal(r.totals.totalCo2eT, 242693);
  assert.equal(r.totals.co2T, 225851);
  assert.equal(r.totals.ch4T, 601.5);
  assert.equal(r.totals.intensityKgCo2ePerBoe, 12.63);
  assert.equal(r.methane.length, 9);
  assert.ok(r.methane.every((m) => m.status === "quantified"));
  assert.equal(r.dataGapsDeclaredNone, false);
  assert.equal(r.dataGaps.length, 1);
  assert.match(r.dataGaps[0].cause, /FT-5102/);
  assert.match(r.dataGaps[0].period, /Mar 2025/);
  assert.equal(r.dataGaps[0].impactTco2e, 58);
  assert.equal(r.dataGaps[0].evidence.rows, "SS-03");
  assert.equal(r.technicalUnits.length, 9);
  assert.equal(r.verification.reference, "KVS-25-094");
});

test("parseEadWorkbook never throws on unexpected workbooks", () => {
  const bare = parseEadWorkbook({ sheets: [] }, doc("empty_RY2024.xlsx"));
  assert.equal(bare.reportingYear, 2024);
  assert.equal(bare.facility.eadId, "");
  assert.ok(bare.warnings.length > 5);
  const odd = parseEadWorkbook(
    {
      sheets: [
        { name: "C1_Identifiers", rows: [{ rowNumber: 3, cells: ["EAD facility registration ID", "AD-PW-0001"] }, { rowNumber: 4, cells: ["Coordinates", "garbage"] }] },
        { name: "D2_Calculation_Approach", rows: [{ rowNumber: 1, cells: ["ID", "Source stream", "Activity data", "Emission factor"] }, { rowNumber: 2, cells: ["SS-1", "Gas", "lots", 56.1] }] },
      ],
    },
    doc("odd.xlsx"),
  );
  assert.equal(odd.facility.eadId, "AD-PW-0001");
  assert.equal(odd.sourceStreams[0].id, "SS-01");
  assert.equal(odd.sourceStreams[0].activity, 0);
  assert.ok(odd.warnings.some((w) => /SS-01 activity/.test(w)));
});

test("evidence CSVs: flare log, production balance, fuel meter, diesel invoices", async () => {
  const flare = parseEvidenceCsv(await csv(SOUTH, "DEC-SDF-CPF2_Flare-Log_Daily_2025.csv"), doc("DEC-SDF-CPF2_Flare-Log_Daily_2025.csv")).flareLog!;
  assert.equal(flare.documentId, "dec-sdf-cpf2-flare-log-daily-2025");
  assert.equal(flare.days.length, 365);
  const day = (d: string) => flare.days.find((x) => x.date === d)!;
  assert.equal(day("2025-06-01").hpSource, "ENGINEERING ESTIMATE");
  assert.equal(day("2025-06-01").hpSm3, 31500);
  assert.match(day("2025-06-01").note, /FT-5101 removed/);
  assert.equal(day("2025-05-31").hpSource, "FT-5101 metered");
  assert.match(day("2025-07-14").pilotStatus, /FLAME-OUT/);

  const production = parseEvidenceCsv(
    await csv(SOUTH, "DEC-SDF-CPF2_Production-and-Gas-Balance_Monthly_2025.csv"),
    doc("DEC-SDF-CPF2_Production-and-Gas-Balance_Monthly_2025.csv"),
  ).productionBalance!;
  assert.equal(production.months.length, 12);
  assert.equal(production.months[0].month, "2025-01");
  assert.equal(production.months[0].flaredByBalanceSm3, 3249987);
  assert.equal(production.months[0].days, 31);
  assert.ok(production.months.every((m) => m.flaredByBalanceSm3 > 0 && m.oilBbl > 0));

  const fuel = parseEvidenceCsv(await csv(SOUTH, "DEC-SDF-CPF2_Fuel-Gas-Meter-FT3001_Monthly_2025.csv"), doc("fuel.csv")).fuelMeter!;
  assert.equal(fuel.months.length, 12);
  assert.equal(
    fuel.months.reduce((s, m) => s + m.volumeSm3, 0),
    98642317,
  );
  assert.equal(fuel.months[0].meterTag, "FT-3001");
  assert.equal(fuel.months[0].ncvMjPerSm3, 36.35);

  const diesel = parseEvidenceCsv(await csv(SOUTH, "DEC-SDF-CPF2_Diesel-Invoices_2025.csv"), doc("diesel.csv")).dieselInvoices!;
  assert.equal(diesel.invoices.length, 15);
  assert.ok(Math.abs(diesel.invoices.reduce((s, i) => s + i.massT, 0) - 1421.9) < 0.1);
  assert.equal(diesel.invoices[0].date, "2025-01-23");
  assert.equal(diesel.invoices[0].densityKgPerL, 0.84);

  assert.deepEqual(parseEvidenceCsv("a,b\n1,2\n", doc("x.csv")), {});
});

test("classifyDocument uses file names first, then content", () => {
  const cases: [string, string][] = [
    ["DEC-SDF-CPF2_EAD-MRV-Emissions-Report_RY2025.xlsx", "emissions_report"],
    ["DEC-SDF-CPF2_Cover-Letter_RY2025.pdf", "cover_letter"],
    ["DEC-SDF-CPF2_Monitoring-Plan_Rev3.0.pdf", "monitoring_plan"],
    ["DEC-SDF-CPF2_Verification-Statement_RY2025.pdf", "verification_statement"],
    ["evidence/DEC-SDF-CPF2_Meter-Calibration-Certificates.pdf", "calibration_certificates"],
    ["evidence/DEC-SDF-CPF2_Gas-Analysis-Certificate_2025.pdf", "gas_analysis_certificate"],
    ["evidence/DEC-EDF-CPF1_LDAR-Survey-Summary_2025.pdf", "ldar_survey"],
    ["evidence/DEC-SDF-CPF2_Flare-Log_Daily_2025.csv", "flare_log"],
    ["evidence/DEC-SDF-CPF2_Fuel-Gas-Meter-FT3001_Monthly_2025.csv", "fuel_meter_log"],
    ["evidence/DEC-SDF-CPF2_Diesel-Invoices_2025.csv", "diesel_invoices"],
    ["evidence/DEC-SDF-CPF2_Production-and-Gas-Balance_Monthly_2025.csv", "production_gas_balance"],
    ["report.xlsx", "emissions_report"],
    ["notes.txt", "other"],
  ];
  for (const [file, kind] of cases) assert.equal(classifyDocument(file), kind, file);
  assert.equal(classifyDocument("data.csv", { csvHeader: ["date", "hp_flare_fl501_sm3", "lp_flare_fl502_sm3"] }), "flare_log");
  assert.equal(classifyDocument("scan.pdf", { firstText: "VERIFICATION STATEMENT ... reasonable assurance" }), "verification_statement");
});

test("reference data: peers, prior year, satellite detections and facilities", async () => {
  const ref = await loadReferenceData(REGULATOR);
  assert.equal(ref.peers.length, 8);
  const south = ref.peers.find((p) => p.eadId === "AD-OG-0417")!;
  assert.equal(south.intensityKgCo2ePerBoe, 10.65);
  assert.equal(south.facility, "Southern Dunes CPF-2");
  assert.equal(south.verificationOpinion, "Qualified");
  assert.equal(ref.priorYear.length, 10);
  assert.equal(ref.priorYear.find((p) => p.eadId === "AD-OG-0417" && p.item === "TOTAL")?.tco2e, 302003);
  assert.equal(ref.priorYear.find((p) => p.item === "CH4")?.activity, undefined);

  assert.equal(ref.detections.length, 4);
  assert.ok(ref.detections.every((d) => d.simulated && d.plumePolygon && d.plumePolygon[0].length > 3));
  assert.equal(ref.detections.find((d) => d.id === "SIM-2025-0409-E1")?.nearestFacilityId, "AD-OG-0412");
  const s1 = ref.detections.find((d) => d.id === "SIM-2025-0714-S1")!;
  assert.equal(s1.rateKgCh4PerH, 1820);
  assert.equal(s1.localDate, "2025-07-14");
  assert.equal(s1.localTimeGst, "13:31");
  assert.equal(s1.nearestEquipment, "HP flare FL-501");
  assert.equal(s1.lat, 22.817234);
  assert.equal(s1.lon, 54.133748);
  assert.equal(ref.detections.find((d) => d.id === "SIM-2025-1019-S3")?.nearestEquipment, "Tank farm T-401A/B");

  assert.equal(ref.facilities.length, 2);
  assert.ok(ref.facilities.every((f) => f.equipment.length === 3));
  assert.equal(ref.facilities.find((f) => f.eadId === "AD-OG-0417")?.name, "Southern Dunes CPF-2");
  assert.ok(ref.sources.peers && ref.sources.priorYear && ref.sources.satellite);

  const empty = await loadReferenceData(path.join(REGULATOR, "does-not-exist"));
  assert.deepEqual(empty, { peers: [], priorYear: [], detections: [], facilities: [], sources: {} });
});

test("loadSubmissionPackage: South package documents, PDF text, report and evidence", async () => {
  const pkg = await loadSubmissionPackage(SOUTH, { submissionId: "south", source: "demo" });
  assert.deepEqual(pkg.warnings, []);
  assert.equal(pkg.documents.length, 10);
  const kinds = Object.fromEntries(pkg.documents.map((d) => [d.id, d.kind]));
  assert.deepEqual(kinds, {
    "dec-sdf-cpf2-cover-letter-ry2025": "cover_letter",
    "dec-sdf-cpf2-ead-mrv-emissions-report-ry2025": "emissions_report",
    "dec-sdf-cpf2-monitoring-plan-rev3-0": "monitoring_plan",
    "dec-sdf-cpf2-verification-statement-ry2025": "verification_statement",
    "dec-sdf-cpf2-diesel-invoices-2025": "diesel_invoices",
    "dec-sdf-cpf2-flare-log-daily-2025": "flare_log",
    "dec-sdf-cpf2-fuel-gas-meter-ft3001-monthly-2025": "fuel_meter_log",
    "dec-sdf-cpf2-gas-analysis-certificate-2025": "gas_analysis_certificate",
    "dec-sdf-cpf2-meter-calibration-certificates": "calibration_certificates",
    "dec-sdf-cpf2-production-and-gas-balance-monthly-2025": "production_gas_balance",
  });
  const flare = pkg.documents.find((d) => d.kind === "flare_log")!;
  assert.equal(flare.relativePath, "evidence/DEC-SDF-CPF2_Flare-Log_Daily_2025.csv");
  assert.equal(flare.rowCount, 365);
  assert.equal(flare.mediaType, "text/csv");
  assert.match(flare.sha256, /^[0-9a-f]{64}$/);
  const workbook = pkg.documents.find((d) => d.kind === "emissions_report")!;
  assert.equal(workbook.sheetNames?.length, 14);
  for (const d of pkg.documents.filter((x) => x.mediaType === "application/pdf")) {
    assert.ok(d.pageCount && d.pageCount > 0, d.fileName);
    assert.equal(pkg.pdfText[d.id]?.length, d.pageCount);
  }
  assert.match(pkg.pdfText["dec-sdf-cpf2-meter-calibration-certificates"][1].text, /FT-5101/);
  assert.equal(pkg.report?.documentId, workbook.id);
  assert.equal(pkg.report?.totals.totalCo2eT, 274896);
  assert.equal(pkg.evidence.flareLog?.days.length, 365);
  assert.equal(pkg.evidence.fuelMeter?.months.length, 12);
  assert.equal(pkg.evidence.dieselInvoices?.invoices.length, 15);
  assert.equal(pkg.evidence.productionBalance?.months.length, 12);
  assert.ok(pkg.loadedInMs >= 0);
});

test("loadSubmissionPackage: East package includes the LDAR survey", async () => {
  const pkg = await loadSubmissionPackage(EAST, { submissionId: "east", source: "demo" });
  assert.deepEqual(pkg.warnings, []);
  assert.equal(pkg.documents.length, 11);
  assert.ok(pkg.documents.some((d) => d.kind === "ldar_survey" && d.pageCount));
});

test("readPackageSummary parses only the workbook", async () => {
  const summary = await readPackageSummary(SOUTH);
  assert.equal(summary.documentCount, 10);
  assert.equal(summary.report?.facility.eadId, "AD-OG-0417");
  assert.equal(summary.workbook?.id, "dec-sdf-cpf2-ead-mrv-emissions-report-ry2025");
});

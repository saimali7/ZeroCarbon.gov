import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import type {
  DocumentKind,
  EmissionsReport,
  EvidenceData,
  FacilityPoint,
  PeerBenchmark,
  PriorYearRecord,
  ReferenceData,
  SatelliteDetection,
  SubmissionDocument,
} from "@zerocarbon/shared";
import { extractText, getDocumentProxy } from "unpdf";
import { docId, REFERENCE_DOCS } from "./fixtures";

export interface PageText {
  page: number;
  text: string;
}

/** One file of a submission package, held in memory. */
export interface LoadedDoc {
  meta: SubmissionDocument;
  data: Buffer;
  /** Set for demo files, so downloads stream from disk. */
  absPath?: string;
  pages?: PageText[];
}

/** Walks up from `start` to the monorepo root (the folder that contains demo/submissions). */
export function findRepoRoot(start: string): string {
  for (let dir = path.resolve(start); ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, "demo", "submissions"))) return dir;
    if (path.dirname(dir) === dir) throw new Error(`demo/submissions not found above ${start}`);
  }
}

/** RFC 4180 CSV parser (quotes, escaped quotes, CRLF, BOM). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") row.push(cell), (cell = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell), rows.push(row), (row = []), (cell = "");
    } else cell += c;
  }
  if (cell !== "" || row.length) row.push(cell), rows.push(row);
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

export function csvRecords(text: string): { header: string[]; records: Record<string, string>[] } {
  const [header = [], ...rows] = parseCsv(text);
  return { header, records: rows.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ""]))) };
}

const MEDIA: Record<string, string> = {
  ".pdf": "application/pdf",
  ".csv": "text/csv",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xlsm": "application/vnd.ms-excel.sheet.macroEnabled.12",
  ".geojson": "application/geo+json",
  ".json": "application/json",
  ".txt": "text/plain",
};

export const mediaTypeFor = (name: string, fallback = "application/octet-stream") => MEDIA[path.extname(name).toLowerCase()] ?? fallback;

const NAME_RULES: [RegExp, DocumentKind][] = [
  [/ead[-_ ]?mrv|emissions?[-_ ]?report/i, "emissions_report"],
  [/cover[-_ ]?letter/i, "cover_letter"],
  [/monitoring[-_ ]?plan/i, "monitoring_plan"],
  [/verification[-_ ]?(statement|opinion|report)/i, "verification_statement"],
  [/calibration/i, "calibration_certificates"],
  [/gas[-_ ]?analysis|analysis[-_ ]?certificate/i, "gas_analysis_certificate"],
  [/ldar|leak[-_ ]?detection/i, "ldar_survey"],
  [/flare[-_ ]?log/i, "flare_log"],
  [/fuel[-_ ]?(gas[-_ ]?)?meter/i, "fuel_meter_log"],
  [/diesel|invoices?\b/i, "diesel_invoices"],
  [/production|gas[-_ ]?balance/i, "production_gas_balance"],
];

function csvKind(header: string[]): DocumentKind | undefined {
  const has = (re: RegExp) => header.some((h) => re.test(h.toLowerCase()));
  if (has(/date/) && has(/hp.*sm3|fl-?501/)) return "flare_log";
  if (has(/invoice/)) return "diesel_invoices";
  if (has(/month/) && has(/oil/)) return "production_gas_balance";
  if (has(/month/) && has(/meter/)) return "fuel_meter_log";
  return undefined;
}

/** Document kind from the file name, then the workbook extension, then the CSV header. */
export function classifyKind(name: string, csvHeader?: string[]): DocumentKind {
  const byName = NAME_RULES.find(([re]) => re.test(name))?.[1];
  if (byName) return byName;
  if (/\.xls[xm]$/i.test(name)) return "emissions_report";
  return (csvHeader && csvKind(csvHeader)) || "other";
}

/** Sheet names of an .xlsx file, read from xl/workbook.xml in the zip (no dependencies). */
export function xlsxSheetNames(buf: Buffer): string[] {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) return [];
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < count && buf.readUInt32LE(p) === 0x02014b50; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const skip = nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    if (buf.toString("utf8", p + 46, p + 46 + nameLen) === "xl/workbook.xml") {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const raw = buf.subarray(start, start + size);
      const xml = (method === 8 ? inflateRawSync(raw) : raw).toString("utf8");
      const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
      return Array.from(xml.matchAll(/<sheet\b[^>]*\bname="([^"]*)"/g), (m) => decode(m[1]));
    }
    p += 46 + skip;
  }
  return [];
}

/** Extracted PDF text per page (1-based), with ligatures and non-breaking spaces normalised. */
export async function pdfPages(data: Uint8Array): Promise<PageText[]> {
  const pdf = await getDocumentProxy(new Uint8Array(data));
  try {
    const { text } = await extractText(pdf, { mergePages: false });
    return text.map((t, i) => ({
      page: i + 1,
      text: t.normalize("NFKC").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(),
    }));
  } finally {
    await pdf.destroy();
  }
}

/** Builds SubmissionDocuments (ids, kinds, hashes, page/row counts, sheet names) for a set of files. */
export async function describeFiles(files: { relativePath: string; data: Buffer; absPath?: string; mediaType?: string }[]): Promise<LoadedDoc[]> {
  const seen = new Map<string, number>();
  const out: LoadedDoc[] = [];
  for (const f of files) {
    const fileName = path.posix.basename(f.relativePath);
    const base = docId(fileName);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const ext = path.extname(fileName).toLowerCase();
    const meta: SubmissionDocument = {
      id: n > 1 ? `${base}-${n}` : base,
      fileName,
      relativePath: f.relativePath,
      kind: "other",
      mediaType: mediaTypeFor(fileName, f.mediaType || undefined),
      sizeBytes: f.data.length,
      sha256: createHash("sha256").update(f.data).digest("hex"),
    };
    const doc: LoadedDoc = { meta, data: f.data, absPath: f.absPath };
    if (ext === ".pdf") {
      try {
        doc.pages = await pdfPages(f.data);
        meta.pageCount = doc.pages.length;
      } catch {
        doc.pages = [];
      }
    }
    let header: string[] | undefined;
    if (ext === ".csv") {
      const rows = parseCsv(f.data.toString("utf8"));
      header = rows[0];
      meta.rowCount = Math.max(0, rows.length - 1);
    }
    if (ext === ".xlsx" || ext === ".xlsm") meta.sheetNames = xlsxSheetNames(f.data);
    meta.kind = classifyKind(fileName, header);
    out.push(doc);
  }
  return out;
}

/** Reads every file of a demo package folder (dot files skipped), with paths relative to the folder. */
export async function readPackageFolder(dir: string): Promise<{ relativePath: string; data: Buffer; absPath: string }[]> {
  const out: { relativePath: string; data: Buffer; absPath: string }[] = [];
  const walk = async (rel: string) => {
    const entries = await readdir(path.join(dir, rel), { withFileTypes: true });
    for (const e of entries.sort((a, b) => Number(a.isDirectory()) - Number(b.isDirectory()) || a.name.localeCompare(b.name))) {
      if (e.name.startsWith(".")) continue;
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(relPath);
      else if (e.isFile()) out.push({ relativePath: relPath, absPath: path.join(dir, relPath), data: await readFile(path.join(dir, relPath)) });
    }
  };
  await walk("");
  return out;
}

const num = (s: string | undefined) => Number((s ?? "").replace(/,/g, "")) || 0;
const optNum = (s: string | undefined) => (s === undefined || s.trim() === "" ? undefined : num(s));

/** Parses the evidence CSVs of a package into typed records. */
export function parseEvidence(docs: LoadedDoc[]): EvidenceData {
  const recs = (kind: DocumentKind) => {
    const doc = docs.find((d) => d.meta.kind === kind && d.meta.fileName.toLowerCase().endsWith(".csv"));
    return doc && { documentId: doc.meta.id, fileName: doc.meta.fileName, rows: csvRecords(doc.data.toString("utf8")).records };
  };
  const evidence: EvidenceData = {};
  const flare = recs("flare_log");
  if (flare)
    evidence.flareLog = {
      documentId: flare.documentId, fileName: flare.fileName,
      days: flare.rows.map((r) => ({
        date: r.date, hpSm3: num(r.hp_flare_fl501_sm3), hpSource: r.hp_data_source, lpSm3: num(r.lp_flare_fl502_sm3), lpSource: r.lp_data_source,
        pilotStatus: r.pilot_status, note: r.event_notes ?? "",
      })),
    };
  const fuel = recs("fuel_meter_log");
  if (fuel)
    evidence.fuelMeter = {
      documentId: fuel.documentId, fileName: fuel.fileName,
      months: fuel.rows.map((r) => ({ month: r.month, meterTag: r.meter_tag, volumeSm3: num(r.volume_sm3), status: r.data_status, ncvMjPerSm3: optNum(r.lab_ncv_mj_per_sm3), note: r.note ?? "" })),
    };
  const diesel = recs("diesel_invoices");
  if (diesel)
    evidence.dieselInvoices = {
      documentId: diesel.documentId, fileName: diesel.fileName,
      invoices: diesel.rows.map((r) => ({
        invoiceNo: r.invoice_no, date: r.delivery_date, supplier: r.supplier, product: r.product, litres: num(r.volume_litres),
        densityKgPerL: optNum(r.density_kg_per_l_15c), massT: num(r.mass_t), deliveredTo: r.delivered_to,
      })),
    };
  const prod = recs("production_gas_balance");
  if (prod)
    evidence.productionBalance = {
      documentId: prod.documentId, fileName: prod.fileName,
      months: prod.rows.map((r) => ({
        month: r.month, days: num(r.days), oilBbl: num(r.oil_bbl), avgBopd: optNum(r.avg_bopd), gasProducedSm3: num(r.gas_produced_sm3),
        fuelGasSm3: num(r.fuel_gas_sm3), gasExportedSm3: num(r.gas_exported_sm3), gasExportedBoe: optNum(r.gas_exported_boe),
        gasReinjectedSm3: num(r.gas_reinjected_sm3), flaredByBalanceSm3: num(r.flared_by_balance_sm3), note: r.note ?? "",
      })),
    };
  return evidence;
}

type Props = Record<string, string | number | null | undefined>;
interface GeoFeature {
  geometry: { type: "Point"; coordinates: number[] } | { type: "Polygon"; coordinates: number[][][] };
  properties: Props;
}

/** Regulator reference data parsed from demo/regulator-reference-SIMULATED. */
export async function loadReference(dir: string): Promise<{ data: ReferenceData; files: Record<string, { absPath: string; mediaType: string; fileName: string; size: number }> }> {
  const file = (k: keyof typeof REFERENCE_DOCS) => path.join(dir, REFERENCE_DOCS[k].fileName);
  const [peersCsv, priorCsv, geoText] = await Promise.all([readFile(file("peers"), "utf8"), readFile(file("priorYear"), "utf8"), readFile(file("satellite"), "utf8")]);
  const peers: PeerBenchmark[] = csvRecords(peersCsv).records.map((r) => ({
    eadId: r.ead_facility_id, operator: r.operator, facility: r.facility, emirate: r.emirate, lat: num(r.lat), lon: num(r.lon), reportingYear: num(r.reporting_year),
    productionMmboe: num(r.production_mmboe), reportedTco2e: num(r.reported_tco2e), co2T: num(r.co2_t), ch4T: num(r.ch4_t),
    intensityKgCo2ePerBoe: num(r.intensity_kgco2e_per_boe), ch4IntensityTPerMmboe: num(r.ch4_intensity_t_per_mmboe), flaredSm3PerBoe: num(r.flared_sm3_per_boe),
    methaneSourcesQuantified: num(r.methane_sources_quantified), verificationOpinion: r.verification_opinion,
  }));
  const priorYear: PriorYearRecord[] = csvRecords(priorCsv).records.map((r) => ({
    eadId: r.ead_facility_id, facility: r.facility, reportingYear: num(r.reporting_year), item: r.item, description: r.description,
    activity: optNum(r.activity), unit: r.unit || undefined, co2T: optNum(r.co2_t), ch4T: optNum(r.ch4_t), tco2e: optNum(r.tco2e),
  }));
  const features = (JSON.parse(geoText) as { features: GeoFeature[] }).features;
  const str = (p: Props, k: string) => String(p[k] ?? "");
  const nr = (p: Props, k: string) => Number(p[k] ?? 0);
  const polygons = new Map<string, number[][][]>();
  for (const f of features) if (f.properties.kind === "plume_extent" && f.geometry.type === "Polygon") polygons.set(str(f.properties, "detection_id"), f.geometry.coordinates);
  const detections: SatelliteDetection[] = [];
  const facilities = new Map<string, FacilityPoint>();
  for (const f of features) {
    const p = f.properties;
    if (f.geometry.type !== "Point") continue;
    const [lon, lat] = f.geometry.coordinates;
    if (p.kind === "plume_source") {
      const utc = str(p, "datetime_utc");
      const id = str(p, "detection_id");
      detections.push({
        id, datetimeUtc: utc, localTimeGst: str(p, "local_time_gst"), localDate: new Date(Date.parse(utc) + 4 * 3600e3).toISOString().slice(0, 10),
        rateKgCh4PerH: nr(p, "emission_rate_kg_ch4_per_h"), uncertaintyKgPerH: nr(p, "uncertainty_kg_per_h"), confidence: str(p, "confidence"),
        windFromDeg: nr(p, "wind_from_deg"), windSpeedMs: nr(p, "wind_speed_m_s"), plumeLengthM: nr(p, "plume_length_m"),
        nearestFacilityId: str(p, "nearest_facility_id"), nearestFacility: str(p, "nearest_facility"), nearestEquipment: str(p, "nearest_equipment"),
        distanceToEquipmentM: nr(p, "distance_to_equipment_m"), lat, lon, instrument: str(p, "instrument"), note: str(p, "note"),
        simulated: /simulated/i.test(`${str(p, "instrument")} ${REFERENCE_DOCS.satellite.fileName}`), plumePolygon: polygons.get(id),
      });
    } else if (p.kind === "facility") {
      const id = str(p, "ead_facility_id");
      facilities.set(id, { eadId: id, name: str(p, "facility"), operator: str(p, "operator") || undefined, lat, lon, equipment: facilities.get(id)?.equipment ?? [] });
    } else if (p.kind === "equipment") {
      const id = str(p, "ead_facility_id");
      const fac = facilities.get(id) ?? { eadId: id, name: id, lat, lon, equipment: [] };
      fac.equipment.push({ name: str(p, "equipment"), lat, lon });
      facilities.set(id, fac);
    }
  }
  const rel = (k: keyof typeof REFERENCE_DOCS) => `regulator-reference-SIMULATED/${REFERENCE_DOCS[k].fileName}`;
  return {
    data: { peers, priorYear, detections, facilities: [...facilities.values()], sources: { peers: rel("peers"), priorYear: rel("priorYear"), satellite: rel("satellite") } },
    files: Object.fromEntries(
      await Promise.all(
        (Object.keys(REFERENCE_DOCS) as (keyof typeof REFERENCE_DOCS)[]).map(async (k) => {
          const { id, mediaType, fileName } = REFERENCE_DOCS[k];
          return [id, { absPath: file(k), mediaType, fileName, size: (await stat(file(k))).size }] as const;
        }),
      ),
    ),
  };
}

const fmt = (v: number | string | null | undefined) => (typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 4 }) : v ?? "");

/** Readable text rendering of the key workbook sheets, built from the parsed report. */
export function renderReportText(r: EmissionsReport): string {
  const L: string[] = [];
  const sheet = (name: string) => L.push("", `[${name}]`);
  const row = (...cells: (number | string | null | undefined)[]) => L.push(cells.map(fmt).join(" | "));
  L.push(r.templateName ?? "EAD MRV emissions report", `${r.operator.name} | ${r.facility.name} | EAD Facility ID ${r.facility.eadId} | Reporting year ${r.reportingYear}`);
  sheet("C1_Identifiers");
  row("Operator legal name", r.operator.name);
  row("Operator name (Arabic)", r.operator.nameAr);
  row("Commercial licence number", r.operator.licence);
  row("Registered address", r.operator.address);
  row("Facility name", r.facility.name);
  row("EAD facility registration ID", r.facility.eadId);
  row("EAD environmental permit number", r.facility.permit);
  row("Covered sector / activity", r.facility.sectorText);
  row("Location", r.facility.location);
  row("Coordinates (WGS84)", `${r.facility.lat} N, ${r.facility.lon} E`);
  row("Reporting period", `${r.period.start} to ${r.period.end}`);
  row("Monitoring Plan applied", `${r.monitoringPlan?.reference} Rev ${r.monitoringPlan?.revision} (${r.monitoringPlan?.date})`);
  row("GHG manager", r.contacts?.ghgLead);
  row("Facility manager", r.contacts?.facilityManager);
  row("Date of submission", r.submittedOn);
  if (r.declaration) L.push("(e) Operator declaration", r.declaration.text, `Name / position: ${r.declaration.signedBy} | Date: ${r.declaration.date}`);
  sheet("C2_Facility_Description");
  L.push("(a) Non-technical summary", r.summaryText ?? "", "(b) Main technical units");
  for (const u of r.technicalUnits) row(u.tag, u.description, u.capacity, u.sourceStream ?? "-", u.inScope ? "Yes" : "No", u.notes);
  L.push("(d) Dynamic data (reporting year)");
  for (const [k, v] of Object.entries(r.dynamicData)) row(k, v);
  L.push("(e) Monitoring approaches used");
  row("Calculation", r.approaches.calculation ? "Yes" : "No");
  row("Measurement", r.approaches.measurement ? "Yes" : "No");
  row("Fallback", r.approaches.fallback ? "Yes" : "No");
  row("Methane", r.approaches.methane ? "Yes" : "No");
  L.push("(f) Emissions summary");
  for (const s of r.sourceStreams) row(s.id, s.name, `${fmt(s.co2T)} t CO2`);
  row("CH4", "All methane sources (sheet G)", `${fmt(r.totals.ch4T)} t CH4`, `${fmt(r.totals.ch4Co2eT)} t CO2e`);
  row("TOTAL", "Facility total (Scope 1)", `${fmt(r.totals.co2T)} t CO2`, `${fmt(r.totals.totalCo2eT)} t CO2e`);
  sheet("D1_Source_Streams");
  row("ID", "Source stream", "Type", "Category", "Activity data measurement", "Tier", "Max. uncertainty", "Calculation factors basis");
  for (const s of r.sourceStreams) row(s.id, s.name, s.type, s.category, s.measurement, s.activityTier, s.maxUncertainty, s.factorsBasis);
  sheet("D2_Calculation_Approach");
  L.push("(a) Annual calculation per source stream");
  row("ID", "Source stream", "Activity data", "Unit", "NCV", "NCV unit", "Energy (TJ)", "Emission factor", "EF unit", "Oxidation factor", "CO2 (t)", "Tiers", "Data source");
  for (const s of r.sourceStreams)
    row(s.id, s.name, s.activity, s.activityUnit, s.ncv ?? "n/a", s.ncvUnit, s.energyTj ?? "n/a", s.emissionFactor, s.emissionFactorUnit, s.oxidationFactor, s.co2T, s.tiers, s.dataSource);
  row("", "TOTAL CO2", "", "", "", "", "", "", "", "", r.totals.co2T);
  L.push("(b) Monthly activity data");
  row("Month", "SS-01 Fuel gas (Sm3)", "SS-02 HP flare (Sm3)", "SS-03 LP flare (Sm3)", "Flare total (Sm3)");
  for (const m of r.monthly) row(m.month, m.byStream["SS-01"], m.byStream["SS-02"], m.byStream["SS-03"], (m.byStream["SS-02"] ?? 0) + (m.byStream["SS-03"] ?? 0));
  if (r.dieselStock) {
    L.push("(c) Diesel stock reconciliation");
    row("Opening stock (t)", r.dieselStock.openingT);
    row("Deliveries per invoices (t)", r.dieselStock.deliveriesT);
    row("Closing stock (t)", r.dieselStock.closingT);
    row("Consumption (t)", r.dieselStock.consumptionT);
  }
  for (const [name, text] of Object.entries(r.notApplicableSheets)) sheet(name), L.push(text);
  sheet("G_Methane");
  row("ID", "Methane source", "Category", "Quantification method", "Basis / activity", "CH4 (t)", "GWP", "t CO2e", "Notes");
  for (const m of r.methane) row(m.id, m.source, m.category, m.method, m.basis, m.ch4T ?? "n/a", m.gwp ?? "", m.co2eT ?? "n/a", m.note);
  row("", "TOTAL METHANE", "", "", "", r.totals.ch4T, r.totals.gwpCh4, r.totals.ch4Co2eT);
  sheet("H1_Verification_Data_Gaps");
  L.push("(a) Data gaps during the reporting period");
  if (r.dataGapsDeclaredNone) row("None", "-", "No data gaps identified during the reporting period.", "-", 0);
  for (const g of r.dataGaps) row(g.sourceStream, g.period, g.cause, g.substitutionMethod, g.impactTco2e);
  L.push("(b) Verification");
  row("Verification body", r.verification.body);
  row("Verification statement reference", `${r.verification.reference}, dated ${r.verification.date}`);
  row("Level of assurance", r.verification.assurance);
  row("Verification outcome", r.verification.outcome);
  row("Site visit", r.verification.siteVisit);
  sheet("I_Management_QA");
  L.push("(c) Measuring instruments register");
  row("Tag", "Service", "Type", "Tier", "Last calibration", "Next due", "Certificate", "Status");
  for (const i of r.instruments) row(i.tag, i.service, i.type, i.tier, i.lastCalibration, i.nextDue, i.certificate, i.status);
  sheet("J_Mitigation_Measures");
  row("ID", "Measure", "Type", "Status", "Year", "Est. reduction (t CO2e/yr)", "Notes");
  for (const m of r.mitigation) row(m.id, m.measure, m.type, m.status, m.year === undefined ? "" : String(m.year), m.reductionTco2ePerYear ?? "TBD", m.notes);
  return L.join("\n").trim();
}

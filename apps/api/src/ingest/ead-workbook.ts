import type {
  DeclaredDataGap,
  EmissionsReport,
  EvidenceRef,
  InstrumentRecord,
  MethaneLine,
  MethaneLineStatus,
  MitigationMeasure,
  MonthlyActivity,
  Sector,
  SourceStream,
  SubmissionDocument,
  TechnicalUnit,
} from "@zerocarbon/shared";
import type { XlsxCell, XlsxRow, XlsxSheet, XlsxWorkbook } from "./xlsx.ts";

// ---------------------------------------------------------------------------
// Value helpers (also used by the CSV evidence parser)
// ---------------------------------------------------------------------------

const MONTH_NAMES = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const pad = (n: number) => String(n).padStart(2, "0");

function monthNumber(name: string): number {
  const word = name.toLowerCase().replace(/\.$/, "");
  if (word.length < 3) return 0;
  return MONTH_NAMES.findIndex((m) => m.startsWith(word) || (word === "sept" && m === "september")) + 1;
}

function isoFrom(y: number, m: number, d: number): string | undefined {
  if (!(m >= 1 && m <= 12 && y >= 1900 && y <= 2200)) return undefined;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : undefined;
}

const DATE_RE =
  /(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})(?:st|nd|rd|th)?[\s./-]+([A-Za-z]{3,9}\.?)[\s./,-]+(\d{4})|([A-Za-z]{3,9}\.?)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})|(\d{1,2})[/.](\d{1,2})[/.](\d{4})/g;

/** All dates found in a text, as ISO `YYYY-MM-DD` (day-first for numeric dates, as used in the UAE). */
export function findDates(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(DATE_RE)) {
    const iso = m[1]
      ? isoFrom(+m[1], +m[2], +m[3])
      : m[4]
        ? isoFrom(+m[6], monthNumber(m[5]), +m[4])
        : m[7]
          ? isoFrom(+m[9], monthNumber(m[7]), +m[8])
          : isoFrom(+m[12], +m[11], +m[10]);
    if (iso) out.push(iso);
  }
  return out;
}

/** "30 Mar 2026", "01-Jan-2025", "2025-01-01", "18/01/2025" or an Excel serial date -> "YYYY-MM-DD". */
export function toIsoDate(value: unknown): string | undefined {
  if (typeof value === "number") {
    if (value < 20000 || value > 80000) return undefined;
    return new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000).toISOString().slice(0, 10);
  }
  return typeof value === "string" ? findDates(value)[0] : undefined;
}

/** "2025-01", "2025-01-31", "Jan", "January 2025", "Jan-25" -> "YYYY-MM" (year from the text or `year`). */
export function toMonth(value: unknown, year?: number): string | undefined {
  const s = cellText(value as XlsxCell);
  const iso = s.match(/^(\d{4})-(\d{1,2})\b/);
  if (iso) return +iso[2] >= 1 && +iso[2] <= 12 ? `${iso[1]}-${pad(+iso[2])}` : undefined;
  const named = s.match(/^([A-Za-z]{3,9})\.?(?:[\s,/-]+(\d{2}|\d{4}))?$/);
  if (!named) return undefined;
  const m = monthNumber(named[1]);
  const y = named[2] ? (named[2].length === 2 ? 2000 + +named[2] : +named[2]) : year;
  return m && y ? `${y}-${pad(m)}` : undefined;
}

/** Numbers as written: 1234, "1,234.5", " 12 ". Returns undefined for text such as "n/a" or "TBD". */
export function toNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;
  const s = value.trim().replace(/[,\s]/g, "");
  return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ? Number(s) : undefined;
}

function toYear(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isInteger(value) && value > 1900 && value < 2200 ? value : undefined;
  const m = typeof value === "string" ? value.match(/\b(19|20|21)\d{2}\b/) : null;
  return m ? Number(m[0]) : undefined;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Sheet navigation
// ---------------------------------------------------------------------------

type Cell = XlsxCell | undefined;

function cellText(v: Cell): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

const optText = (v: Cell) => cellText(v) || undefined;
const filled = (row: XlsxRow) => row.cells.filter((v) => cellText(v) !== "");
const SECTION_RE = /^\([a-z]{1,2}\)\s+\S/i;
const isHeading = (row: XlsxRow) => {
  const f = filled(row);
  return f.length === 1 && SECTION_RE.test(cellText(f[0]));
};

function findSheet(workbook: XlsxWorkbook, code: string): XlsxSheet | undefined {
  const re = new RegExp(`^${code}(?:[_ .-]|$)`, "i");
  return workbook.sheets.find((s) => re.test(s.name.trim()));
}

/** Rows under a "(x) Heading" row, up to the next heading. */
function section(sheet: XlsxSheet | undefined, heading: RegExp): XlsxRow[] | undefined {
  if (!sheet) return undefined;
  const start = sheet.rows.findIndex((r) => isHeading(r) && heading.test(cellText(filled(r)[0])));
  if (start < 0) return undefined;
  const next = sheet.rows.findIndex((r, i) => i > start && isHeading(r));
  return sheet.rows.slice(start + 1, next < 0 ? undefined : next);
}

/** Free-text rows (a single filled cell, not a heading). */
function paragraphs(rows: XlsxRow[]): { row: XlsxRow; text: string }[] {
  return rows.filter((r) => filled(r).length === 1 && !isHeading(r)).map((row) => ({ row, text: cellText(filled(row)[0]) }));
}

interface Pair {
  label: string;
  value: XlsxCell;
  row: XlsxRow;
}

/** Label/value rows: exactly two filled cells. */
function pairs(rows: XlsxRow[] | undefined): Pair[] {
  return (rows ?? []).flatMap((row) => {
    const f = filled(row);
    return f.length === 2 ? [{ label: cellText(f[0]), value: f[1], row }] : [];
  });
}

const pair = (list: Pair[], re: RegExp) => list.find((p) => re.test(p.label));

interface Table {
  header: string[];
  rows: XlsxRow[];
}

/** First table whose header row matches every pattern; body = following contiguous rows with 2+ filled cells. */
function findTable(rows: XlsxRow[] | undefined, required: RegExp[]): Table | undefined {
  if (!rows) return undefined;
  for (let i = 0; i < rows.length; i++) {
    const header = rows[i].cells.map(cellText);
    if (filled(rows[i]).length < 2 || !required.every((re) => header.some((h) => re.test(h)))) continue;
    const body: XlsxRow[] = [];
    let prev = rows[i].rowNumber;
    for (const row of rows.slice(i + 1)) {
      if (row.rowNumber !== prev + 1 || filled(row).length < 2) break;
      body.push(row);
      prev = row.rowNumber;
    }
    return { header, rows: body };
  }
  return undefined;
}

/** Cell getter by column key, resolved from header patterns (first matching header wins). */
function columns<K extends string>(table: Table | undefined, spec: Record<K, RegExp>): (row: XlsxRow | undefined, key: K) => XlsxCell {
  const index = {} as Record<K, number>;
  for (const key of Object.keys(spec) as K[]) index[key] = table ? table.header.findIndex((h) => spec[key].test(h)) : -1;
  return (row, key) => (row && index[key] >= 0 ? (row.cells[index[key]] ?? null) : null);
}

const isTotalRow = (row: XlsxRow) => row.cells.some((v) => /^total\b/i.test(cellText(v)));

function normalizeId(value: Cell, prefix: "SS" | "M"): string | undefined {
  const m = cellText(value).match(new RegExp(`^${prefix}[-\\s]?(\\d+)`, "i"));
  return m ? `${prefix}-${m[1].padStart(2, "0")}` : undefined;
}

// ---------------------------------------------------------------------------
// Field interpretation
// ---------------------------------------------------------------------------

function mapSector(text: string): Sector | undefined {
  const head = text.split(":")[0];
  for (const t of [head, text]) {
    if (/oil|gas|petrol|refin|lng/i.test(t)) return "oil_and_gas";
    if (/power|electric|desal|utilit/i.test(t)) return "power";
    if (/transport|aviation|shipping|maritime/i.test(t)) return "transport";
    if (/industr|cement|steel|alumin|chemic|manufactur|fertili|petrochem/i.test(t)) return "industry";
  }
  return undefined;
}

const EMIRATES = ["Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah"];

function emirateOf(location: string): string | undefined {
  const known = EMIRATES.find((e) => new RegExp(`\\b${e}\\b`, "i").test(location));
  return known ?? location.match(/Emirate of ([A-Z][\w' ]*?)\s*(?:[,.;]|$)/i)?.[1];
}

function parseCoordinates(text: string): { lat?: number; lon?: number } {
  const m = text.match(/(-?\d+(?:\.\d+)?)\s*°?\s*([NS])?\s*[,;/\s]\s*(-?\d+(?:\.\d+)?)\s*°?\s*([EW])?/i);
  if (!m) return {};
  const lat = m[2]?.toUpperCase() === "S" ? -Math.abs(+m[1]) : +m[1];
  const lon = m[4]?.toUpperCase() === "W" ? -Math.abs(+m[3]) : +m[3];
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : {};
}

function methaneStatus(ch4: number | undefined, texts: string): MethaneLineStatus {
  if (ch4 !== undefined && ch4 > 0) return "quantified";
  if (/not applicable/i.test(texts)) return "not_applicable";
  if (/not quantified|not estimated/i.test(texts)) return "not_quantified";
  return ch4 === 0 ? "zero" : "not_quantified";
}

const yesNo = (v: Cell): boolean | undefined => (/^y(es)?\b/i.test(cellText(v)) ? true : /^no?\b/i.test(cellText(v)) ? false : undefined);

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/** True when the workbook looks like the EAD MRV template (C1 identifiers + D2 calculation sheets). */
export function isEadWorkbook(workbook: XlsxWorkbook): boolean {
  return Boolean(findSheet(workbook, "C1") && findSheet(workbook, "D2"));
}

/** Parse an EAD MRV workbook into the canonical report. Never throws: problems are recorded in `warnings`. */
export function parseEadWorkbook(workbook: XlsxWorkbook, document: SubmissionDocument): EmissionsReport {
  const warnings: string[] = [];
  const ref = (sheet: XlsxSheet, row: XlsxRow, id?: string, label?: string, quote?: string): EvidenceRef => ({
    documentId: document.id,
    fileName: document.fileName,
    sheet: sheet.name,
    rows: id ?? String(row.rowNumber),
    locator: `Sheet ${sheet.name}, row ${row.rowNumber}${id || label ? ` (${id ?? label})` : ""}`,
    ...(quote ? { quote: quote.length > 300 ? `${quote.slice(0, 297)}...` : quote } : {}),
  });
  const sheet = (code: string, what: string, pattern = code) => {
    const found = findSheet(workbook, pattern);
    if (!found) warnings.push(`Sheet ${code} (${what}) not found.`);
    return found;
  };

  const contents = findSheet(workbook, "A");
  const c1 = sheet("C1", "identifiers");
  const c2 = sheet("C2", "facility description");
  const d1 = sheet("D1", "source streams");
  const d2 = sheet("D2", "calculation approach");
  const g = sheet("G", "methane");
  const h1 = sheet("H1", "verification and data gaps", "H1?");
  const iSheet = sheet("I", "management and QA");
  const j = sheet("J", "mitigation measures");
  const k = findSheet(workbook, "K");

  // C1 identifiers
  const c1Pairs = pairs(c1?.rows);
  const c1Text = (re: RegExp) => cellText(pair(c1Pairs, re)?.value);
  const bandText = workbook.sheets.flatMap((s) => s.rows.slice(0, 3).map((r) => r.cells.map(cellText).join(" "))).join("\n");

  const operator = {
    name: c1Text(/legal name/i) || c1Text(/^operator( name)?$/i),
    nameAr: c1Text(/arabic/i) || undefined,
    licence: c1Text(/licen[cs]e/i) || undefined,
    address: c1Text(/address/i) || undefined,
  };
  if (!operator.name) warnings.push("C1: operator legal name not found.");

  const location = c1Text(/^location/i);
  const sectorText = c1Text(/sector|activity/i);
  const facility: EmissionsReport["facility"] = {
    name: c1Text(/^facility name/i),
    eadId: c1Text(/registration id|facility id/i) || bandText.match(/Facility ID[:\s]+([A-Z0-9][A-Z0-9-]*\d)/i)?.[1] || "",
    permit: c1Text(/permit/i) || undefined,
    sector: mapSector(sectorText),
    sectorText: sectorText || undefined,
    location: location || undefined,
    emirate: emirateOf(location),
    ...parseCoordinates(c1Text(/coordinat|latitude/i)),
    startYear: toYear(pair(c1Pairs, /start of operation|commission|operating since/i)?.value),
  };
  if (!facility.name) warnings.push("C1: facility name not found.");
  if (!facility.eadId) warnings.push("C1: EAD facility registration ID not found.");
  if (facility.lat === undefined) warnings.push("C1: facility coordinates not found or not readable.");

  const [start, end] = findDates(c1Text(/reporting period/i));
  const reportingYear =
    toYear(start) ??
    toYear(bandText.match(/Reporting year\s+(\d{4})/i)?.[1]) ??
    toYear(document.fileName.match(/RY[\s_-]?(\d{4})/i)?.[1]) ??
    0;
  if (!start) warnings.push("C1: reporting period not found; assuming the calendar year.");
  if (!reportingYear) warnings.push("Reporting year could not be determined.");
  const period = { start: start ?? `${reportingYear}-01-01`, end: end ?? `${reportingYear}-12-31` };

  const mpTexts = [c1Text(/monitoring plan/i), cellText(pair(pairs(contents?.rows), /monitoring plan/i)?.value), c1Text(/schematic/i)];
  const mpReference = mpTexts.map((t) => t.match(/\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+){2,}\b/)?.[0]).find(Boolean);
  const mpRevision = mpTexts.map((t) => t.match(/\bRev(?:ision)?\.?\s*(\d[\w.]*)/i)?.[1]).find(Boolean);
  const mpDate = mpTexts.slice(0, 2).map((t) => findDates(t)[0]).find(Boolean);
  const monitoringPlan = mpReference || mpRevision || mpDate ? { reference: mpReference, revision: mpRevision, date: mpDate } : undefined;

  const submittedOn = toIsoDate(pair(c1Pairs, /date of submission|submission date|submitted on/i)?.value);
  if (!submittedOn) warnings.push("C1: date of submission not found.");

  const contacts = {
    ghgLead: c1Text(/ghg manager|person in charge|ghg lead/i) || undefined,
    email: c1Text(/e-?mail/i) || undefined,
    phone: c1Text(/tele|phone/i) || undefined,
    facilityManager: c1Text(/facility manager/i) || undefined,
  };

  let declaration: EmissionsReport["declaration"];
  const declRows = section(c1, /declaration/i);
  if (c1 && declRows) {
    const paras = paragraphs(declRows);
    const declPairs = pairs(declRows);
    if (paras.length > 0) {
      const text = paras.map((p) => p.text).join("\n");
      declaration = {
        text,
        signedBy: cellText(pair(declPairs, /name|position|signed/i)?.value) || undefined,
        date: toIsoDate(pair(declPairs, /^date/i)?.value),
        evidence: ref(c1, paras[0].row, undefined, "operator declaration", text),
      };
    }
  }
  if (!declaration) warnings.push("C1: operator declaration not found.");

  // C2 facility description
  const summaryRows = section(c2, /non.?technical/i) ?? section(c2, /^\(a\)/i);
  const summaryText = summaryRows ? paragraphs(summaryRows).map((p) => p.text).join("\n") || undefined : undefined;

  const technicalUnits: TechnicalUnit[] = [];
  const unitsTable = findTable(section(c2, /technical unit/i) ?? c2?.rows, [/^tag$/i, /descri/i]);
  if (unitsTable) {
    const col = columns(unitsTable, {
      tag: /^tag$/i,
      description: /descri/i,
      capacity: /capacity/i,
      stream: /source stream|fuel/i,
      scope: /scope/i,
      notes: /note|remark/i,
    });
    for (const row of unitsTable.rows) {
      const tag = cellText(col(row, "tag"));
      if (!tag) continue;
      const stream = cellText(col(row, "stream"));
      technicalUnits.push({
        tag,
        description: cellText(col(row, "description")),
        capacity: optText(col(row, "capacity")),
        sourceStream: stream && stream !== "-" ? stream : undefined,
        inScope: yesNo(col(row, "scope")),
        notes: optText(col(row, "notes")),
      });
    }
  } else if (c2) warnings.push("C2: main technical units table not found.");

  const dynamicData: Record<string, number | string> = {};
  for (const p of pairs(section(c2, /dynamic data/i))) dynamicData[p.label] = typeof p.value === "number" ? p.value : cellText(p.value);
  const dyn = (test: (label: string) => boolean) => {
    for (const [label, value] of Object.entries(dynamicData)) if (test(label) && toNumber(value) !== undefined) return toNumber(value);
    return undefined;
  };
  const gasExport = (l: string) => /gas.*export|export.*gas/i.test(l);
  let oilBbl = dyn((l) => /crude|oil/i.test(l) && /bbl/i.test(l) && !/rate|\/d\b|per day/i.test(l));
  let gasExportedSm3 = dyn((l) => gasExport(l) && /sm3/i.test(l) && !/boe/i.test(l));
  const gasExportedBoe = dyn((l) => gasExport(l) && /boe/i.test(l));
  let mmboe = dyn((l) => /mmboe/i.test(l));
  const productTable = findTable(section(c2, /product/i), [/product/i, /quantity/i, /unit/i]);
  if (productTable) {
    const col = columns(productTable, { product: /product/i, quantity: /quantity/i, unit: /unit/i });
    for (const row of productTable.rows) {
      const product = cellText(col(row, "product"));
      const unit = cellText(col(row, "unit"));
      const qty = toNumber(col(row, "quantity"));
      if (oilBbl === undefined && /crude|oil/i.test(product) && /bbl/i.test(unit)) oilBbl = qty;
      if (gasExportedSm3 === undefined && /gas/i.test(product) && /sm3/i.test(unit)) gasExportedSm3 = qty;
    }
  }
  if (mmboe === undefined && oilBbl !== undefined && gasExportedBoe !== undefined) mmboe = round2((oilBbl + gasExportedBoe) / 1e6);
  const production = mmboe !== undefined ? { oilBbl, gasExportedSm3, gasExportedBoe, mmboe } : undefined;
  if (!production && c2) warnings.push("C2: total hydrocarbon production (MMboe) not found.");

  // D1 + D2 source streams
  const d1Table = findTable(d1?.rows, [/^id$/i, /categor/i]) ?? findTable(d1?.rows, [/^id$/i, /source stream/i]);
  const d1Col = columns(d1Table, {
    id: /^id$/i,
    name: /source stream/i,
    type: /^type$/i,
    estimate: /^est|\(t co2\)/i,
    category: /categor/i,
    measurement: /measurement|instrument|meter/i,
    tier: /^tier/i,
    uncertainty: /uncertainty/i,
    factors: /factor/i,
  });
  if (d1 && !d1Table) warnings.push("D1: source streams table not found.");

  const d2Table = findTable(section(d2, /annual|per source stream/i) ?? d2?.rows, [/^id$/i, /activity/i, /emission factor|^ef$/i]);
  const d2Col = columns(d2Table, {
    id: /^id$/i,
    name: /source stream/i,
    activity: /^activity/i,
    unit: /^unit/i,
    ncv: /^ncv$/i,
    ncvUnit: /^ncv unit/i,
    energy: /energy|\btj\b/i,
    ef: /^emission factor$|^ef$/i,
    efUnit: /^ef unit|emission factor unit/i,
    oxidation: /oxidation|combustion factor/i,
    co2: /^co2\b/i,
    tiers: /^tiers?\b/i,
    source: /data source|source of data/i,
  });
  if (d2 && !d2Table) warnings.push("D2: annual calculation table not found.");

  const byId = (rows: XlsxRow[] | undefined, id: (row: XlsxRow) => XlsxCell) => {
    const map = new Map<string, XlsxRow>();
    for (const row of rows ?? []) {
      const key = normalizeId(id(row), "SS");
      if (key && !map.has(key)) map.set(key, row);
    }
    return map;
  };
  const d1Rows = byId(d1Table?.rows, (r) => d1Col(r, "id"));
  const d2Rows = byId(d2Table?.rows, (r) => d2Col(r, "id"));
  const sourceStreams: SourceStream[] = [];
  for (const id of new Set([...d2Rows.keys(), ...d1Rows.keys()])) {
    const a = d1Rows.get(id);
    const b = d2Rows.get(id);
    if (!b) warnings.push(`${id} is listed in D1 but has no calculation row in D2 (a).`);
    const tiers = optText(d2Col(b, "tiers"));
    const ncv = toNumber(d2Col(b, "ncv"));
    const oxidation = d2Col(b, "oxidation");
    const activity = toNumber(d2Col(b, "activity"));
    const emissionFactor = toNumber(d2Col(b, "ef"));
    if (b && activity === undefined) warnings.push(`D2: ${id} activity data is missing or not numeric.`);
    if (b && emissionFactor === undefined) warnings.push(`D2: ${id} emission factor is missing or not numeric.`);
    sourceStreams.push({
      id,
      name: cellText(d2Col(b, "name")) || cellText(d1Col(a, "name")) || id,
      type: cellText(d1Col(a, "type")),
      category: optText(d1Col(a, "category")),
      meterTag: `${cellText(d1Col(a, "measurement"))} ${cellText(d2Col(b, "source"))}`.match(/\bFT-?\d{3,5}[A-Z]?\b/i)?.[0].toUpperCase(),
      measurement: optText(d1Col(a, "measurement")),
      activityTier: optText(d1Col(a, "tier")) ?? tiers?.match(/\bAD\s+(Tier\s*\d)/i)?.[1],
      maxUncertainty: optText(d1Col(a, "uncertainty")),
      factorsBasis: optText(d1Col(a, "factors")),
      activity: activity ?? 0,
      activityUnit: cellText(d2Col(b, "unit")),
      ncv,
      ncvUnit: ncv !== undefined ? optText(d2Col(b, "ncvUnit")) : undefined,
      energyTj: toNumber(d2Col(b, "energy")),
      emissionFactor: emissionFactor ?? 0,
      emissionFactorUnit: cellText(d2Col(b, "efUnit")),
      oxidationFactor: typeof oxidation === "number" ? oxidation : optText(oxidation),
      co2T: toNumber(d2Col(b, "co2")) ?? toNumber(d1Col(a, "estimate")) ?? 0,
      tiers,
      dataSource: optText(d2Col(b, "source")),
      evidence: b && d2 ? ref(d2, b, id) : ref(d1!, a!, id),
    });
  }
  if (sourceStreams.length === 0) warnings.push("No source streams found in D1/D2.");
  const d2TotalRow = d2Table?.rows.find((r) => !normalizeId(d2Col(r, "id"), "SS") && isTotalRow(r));
  const d2TotalCo2 = toNumber(d2Col(d2TotalRow, "co2"));

  const monthly: MonthlyActivity[] = [];
  const monthlyTable = findTable(section(d2, /monthly/i) ?? d2?.rows, [/^month/i, /SS[-\s]?\d/i]);
  if (monthlyTable) {
    const streamCols = monthlyTable.header.flatMap((h, i) => {
      const id = h.match(/SS[-\s]?(\d+)/i);
      return id ? [{ i, id: `SS-${id[1].padStart(2, "0")}` }] : [];
    });
    for (const row of monthlyTable.rows) {
      const month = toMonth(row.cells[0], reportingYear);
      if (!month) continue;
      const byStream: Record<string, number> = {};
      for (const { i, id } of streamCols) {
        const n = toNumber(row.cells[i]);
        if (n !== undefined) byStream[id] = n;
      }
      monthly.push({ month, byStream });
    }
  } else if (d2) warnings.push("D2: monthly activity data table not found.");

  const stockPairs = pairs(section(d2, /diesel|stock/i));
  const stock = (re: RegExp) => toNumber(pair(stockPairs, re)?.value);
  const dieselStock = stockPairs.length
    ? { openingT: stock(/opening/i), deliveriesT: stock(/deliver|purchase|receipt/i), closingT: stock(/closing/i), consumptionT: stock(/consum/i) }
    : undefined;

  // E1, E2, F: sheets declared not applicable
  const notApplicableSheets: Record<string, string> = {};
  for (const code of ["E1", "E2", "F"]) {
    const s = findSheet(workbook, code);
    const text = s?.rows.flatMap((r) => r.cells.map(cellText)).find((t) => /^not applicable\b/i.test(t));
    if (s && text) notApplicableSheets[s.name] = text;
  }

  // G methane
  const methane: MethaneLine[] = [];
  const gTable = findTable(g?.rows, [/^id$/i, /ch4|methane/i]);
  let gTotal: { ch4?: number; gwp?: number; co2e?: number } | undefined;
  if (g && gTable) {
    const col = columns(gTable, {
      source: /source/i,
      category: /categor/i,
      method: /method/i,
      basis: /basis|activity/i,
      ch4: /^ch4\b|ch4 \(t\)/i,
      gwp: /^gwp/i,
      co2e: /co2e|co2[- ]?eq/i,
      note: /note|comment|remark/i,
    });
    for (const row of gTable.rows) {
      const id = normalizeId(row.cells[0], "M");
      if (!id) {
        if (isTotalRow(row)) gTotal = { ch4: toNumber(col(row, "ch4")), gwp: toNumber(col(row, "gwp")), co2e: toNumber(col(row, "co2e")) };
        continue;
      }
      const ch4 = toNumber(col(row, "ch4"));
      const [method, basis, note] = [cellText(col(row, "method")), cellText(col(row, "basis")), cellText(col(row, "note"))];
      methane.push({
        id,
        source: cellText(col(row, "source")),
        category: cellText(col(row, "category")),
        method,
        basis,
        ch4T: ch4 ?? null,
        gwp: toNumber(col(row, "gwp")) ?? null,
        co2eT: toNumber(col(row, "co2e")) ?? null,
        note,
        status: methaneStatus(ch4, `${method} | ${note}`),
        evidence: ref(g, row, id),
      });
    }
  } else if (g) warnings.push("G: methane table not found.");

  // C2 (f) emissions summary and totals
  const summaryTable = findTable(section(c2, /emissions summary/i) ?? c2?.rows, [/^id$/i, /co2/i, /total/i]);
  let summary: { co2?: number; ch4?: number; total?: number; ch4Co2e?: number } = {};
  if (summaryTable) {
    const col = columns(summaryTable, { co2: /^co2\b/i, ch4: /^ch4\b/i, total: /total|co2e/i });
    const totalRow = summaryTable.rows.find((r) => /^total\b/i.test(cellText(r.cells[0])));
    const ch4Row = summaryTable.rows.find((r) => /^ch4$/i.test(cellText(r.cells[0])));
    if (totalRow) summary = { co2: toNumber(col(totalRow, "co2")), ch4: toNumber(col(totalRow, "ch4")), total: toNumber(col(totalRow, "total")) };
    if (ch4Row) summary.ch4Co2e = toNumber(col(ch4Row, "total"));
  }
  if (summary.total === undefined) warnings.push("C2: emissions summary TOTAL row not found; totals computed from D2 and G.");

  const kGwp = k ? toNumber(pair(pairs(k.rows), /gwp.*ch4|ch4.*gwp/i)?.value) : undefined;
  let gwpCh4 = gTotal?.gwp ?? methane.find((m) => m.gwp !== null)?.gwp ?? kGwp;
  if (gwpCh4 === undefined) {
    warnings.push("GWP for CH4 not stated; assuming 28 (IPCC AR5).");
    gwpCh4 = 28;
  }
  const co2T = summary.co2 ?? d2TotalCo2 ?? sourceStreams.reduce((s, x) => s + x.co2T, 0);
  const ch4T = summary.ch4 ?? gTotal?.ch4 ?? round2(methane.reduce((s, m) => s + (m.ch4T ?? 0), 0));
  const ch4Co2eT = summary.ch4Co2e ?? gTotal?.co2e ?? Math.round(ch4T * gwpCh4);
  const totalCo2eT = summary.total ?? co2T + ch4Co2eT;
  const totals: EmissionsReport["totals"] = {
    co2T,
    ch4T,
    ch4Co2eT,
    totalCo2eT,
    gwpCh4,
    intensityKgCo2ePerBoe: production?.mmboe ? round2(totalCo2eT / (production.mmboe * 1000)) : undefined,
  };

  // C2 (e) monitoring approaches
  const approachTable = findTable(c2?.rows, [/approach/i, /used/i]);
  const approaches = {
    calculation: sourceStreams.length > 0,
    measurement: false,
    fallback: false,
    methane: methane.length > 0,
  };
  if (approachTable) {
    const col = columns(approachTable, { approach: /approach/i, used: /used/i });
    for (const row of approachTable.rows) {
      const name = cellText(col(row, "approach"));
      const used = yesNo(col(row, "used")) ?? false;
      const key = /fallback/i.test(name) ? "fallback" : /methane|ch4/i.test(name) ? "methane" : /measurement/i.test(name) ? "measurement" : /calculation/i.test(name) ? "calculation" : undefined;
      if (key) approaches[key] = used;
    }
  } else if (c2) warnings.push("C2: monitoring approaches table not found.");

  // H1 data gaps and verification
  const dataGaps: DeclaredDataGap[] = [];
  let dataGapsDeclaredNone = false;
  const gapRows = section(h1, /data gap/i) ?? h1?.rows;
  const gapTable = findTable(gapRows, [/source stream/i, /cause|period/i]);
  if (h1 && gapTable) {
    const col = columns(gapTable, { stream: /source stream/i, period: /period/i, cause: /cause|reason/i, method: /substitut|method/i, impact: /impact/i });
    for (const row of gapTable.rows) {
      const stream = cellText(col(row, "stream"));
      const cause = cellText(col(row, "cause"));
      if (/^(none|nil|n\/a|-)$/i.test(stream) || /no data gaps?/i.test(cause)) {
        dataGapsDeclaredNone = true;
        continue;
      }
      dataGaps.push({
        sourceStream: stream,
        period: cellText(col(row, "period")),
        cause,
        substitutionMethod: cellText(col(row, "method")),
        impactTco2e: toNumber(col(row, "impact")),
        evidence: ref(h1, row, normalizeId(stream, "SS") ?? stream, undefined, cause),
      });
    }
  } else if (h1) warnings.push("H1: data gaps table not found.");
  if (!gapTable && gapRows?.some((r) => r.cells.some((v) => /no data gaps/i.test(cellText(v))))) dataGapsDeclaredNone = true;
  if (dataGaps.length > 0) dataGapsDeclaredNone = false;

  const hPairs = pairs(h1?.rows);
  const hText = (re: RegExp) => cellText(pair(hPairs, re)?.value);
  const refText = hText(/statement ref|reference/i);
  const outcomePair = pair(hPairs, /outcome|opinion/i);
  const verification: EmissionsReport["verification"] = {
    body: hText(/verification body|verifier/i) || c1Text(/verifier/i).replace(/\s*\(.*$/, "") || undefined,
    reference: refText.split(/,?\s+dated\b|\s*\(|,/i)[0].trim() || undefined,
    date: findDates(refText)[0],
    assurance: hText(/assurance/i) || undefined,
    outcome: cellText(outcomePair?.value) || undefined,
    siteVisit: toIsoDate(pair(hPairs, /site visit/i)?.value),
    evidence: h1 && outcomePair ? ref(h1, outcomePair.row, undefined, "verification outcome", cellText(outcomePair.value)) : undefined,
  };
  if (h1 && !verification.outcome) warnings.push("H1: verification outcome not found.");

  // I (c) measuring instruments
  const instruments: InstrumentRecord[] = [];
  const instTable = findTable(section(iSheet, /instrument/i) ?? iSheet?.rows, [/^tag$/i, /calibrat|due/i]);
  if (iSheet && instTable) {
    const col = columns(instTable, {
      tag: /^tag$/i,
      service: /service/i,
      type: /^type$/i,
      tier: /tier/i,
      last: /last|calibrated/i,
      due: /due|next/i,
      cert: /certificate|cert\b/i,
      status: /status/i,
    });
    for (const row of instTable.rows) {
      const tag = cellText(col(row, "tag"));
      if (!tag) continue;
      instruments.push({
        tag,
        service: optText(col(row, "service")),
        type: optText(col(row, "type")),
        tier: optText(col(row, "tier")),
        lastCalibration: toIsoDate(col(row, "last")),
        nextDue: toIsoDate(col(row, "due")),
        certificate: optText(col(row, "cert")),
        status: optText(col(row, "status")),
        evidence: ref(iSheet, row, tag),
      });
    }
  } else if (iSheet) warnings.push("I: measuring instruments register not found.");

  // J mitigation measures
  const mitigation: MitigationMeasure[] = [];
  const mitTable = findTable(section(j, /action|plan|stud|reduc/i) ?? j?.rows, [/^id$/i, /measure/i]);
  if (mitTable) {
    const col = columns(mitTable, { id: /^id$/i, measure: /measure/i, type: /^type$/i, status: /status/i, year: /year/i, reduction: /reduction|co2e/i, notes: /note/i });
    for (const row of mitTable.rows) {
      const measure = cellText(col(row, "measure"));
      if (!measure) continue;
      const reduction = col(row, "reduction");
      mitigation.push({
        id: cellText(col(row, "id")) || `MM-${pad(mitigation.length + 1)}`,
        measure,
        type: optText(col(row, "type")),
        status: optText(col(row, "status")),
        year: toYear(col(row, "year")),
        reductionTco2ePerYear: reduction === null ? undefined : (toNumber(reduction) ?? null),
        notes: optText(col(row, "notes")),
      });
    }
  }

  return {
    documentId: document.id,
    templateName: optText(contents?.rows[0]?.cells[0]),
    operator,
    facility,
    reportingYear,
    period,
    monitoringPlan,
    submittedOn,
    contacts,
    declaration,
    summaryText,
    technicalUnits,
    dynamicData,
    production,
    approaches,
    sourceStreams,
    monthly,
    dieselStock,
    methane,
    totals,
    dataGaps,
    dataGapsDeclaredNone,
    verification,
    instruments,
    mitigation,
    notApplicableSheets,
    warnings,
  };
}

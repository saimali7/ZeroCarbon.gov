import type {
  CalibrationFact,
  CoverLetterFact,
  DeclarationFact,
  DocumentFacts,
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
import {
  DATE,
  type DocText,
  type Heading,
  type Hit,
  ID,
  QUOTE_MAX,
  collapse,
  dedupeRefs,
  escapeRe,
  expandIds,
  find,
  findAll,
  headings,
  pageIndex,
  parseDate,
  parseNum,
  ref,
  rowNumbers,
  sectionAt,
  sentenceSpan,
  titleCaps,
} from "./text.ts";

export type KindFacts = Partial<Pick<DocumentFacts, "calibration" | "gasAnalysis" | "verification" | "monitoringPlan" | "coverLetter" | "ldar">>;

export const EXTRACTABLE_KINDS = new Set<DocumentKind>([
  "calibration_certificates",
  "gas_analysis_certificate",
  "verification_statement",
  "monitoring_plan",
  "cover_letter",
  "ldar_survey",
]);

export function heuristicFacts(doc: DocText, warnings: string[]): KindFacts {
  switch (doc.document.kind) {
    case "calibration_certificates":
      return { calibration: calibrationFacts(doc, warnings) };
    case "gas_analysis_certificate":
      return { gasAnalysis: gasAnalysisFacts(doc, warnings) };
    case "verification_statement":
      return { verification: verificationFacts(doc, warnings) };
    case "monitoring_plan":
      return { monitoringPlan: monitoringPlanFacts(doc, warnings) };
    case "cover_letter":
      return { coverLetter: coverLetterFacts(doc, warnings) };
    case "ldar_survey":
      return { ldar: ldarFacts(doc, warnings) };
    default:
      return {};
  }
}

/** Drop undefined properties (keeps facts clean for JSON and deepEqual). */
export function compact<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}

const TAG = String.raw`[A-Z]{1,4}-\d{2,5}[A-Z]?`;
const METER_TAG = /\b(?:FT|FE|FIT|FQI?|FI|FY|FM)-\d{2,5}[A-Z]?\b/;
const COMPANY = /\b((?:[A-Z][\w&'-]*\s+){1,5}(?:LLC|L\.L\.C|Ltd|Limited|FZE|FZ-LLC|FZCO|GmbH|Inc|PJSC|PLC))\b/;
const PAGE_LINE = /^Page \d+ of \d+/i;

const hitRef = (doc: DocText, h: Hit) => ref(doc, h.start, h.end);
const lineRef = (doc: DocText, h: Hit) => {
  const sp = sentenceSpan(doc, h.start, h.end, { line: true });
  return ref(doc, sp.start, sp.end);
};
const firstPageEnd = (doc: DocText) => doc.starts[1] ?? doc.text.length;
const round = (n: number, digits: number) => Number(n.toFixed(digits));
const decimals = (nums: number[]) => Math.max(0, ...nums.map((n) => (String(n).split(".")[1] ?? "").length));

/** One quote covering two nearby hits on the same page (e.g. calibration date and next due date). */
function pairRef(doc: DocText, a?: Hit, b?: Hit): EvidenceRef | undefined {
  if (a && b && pageIndex(doc, a.start) === pageIndex(doc, b.start)) {
    const s = Math.min(a.start, b.start);
    const e = Math.max(a.end, b.end);
    if (e - s <= QUOTE_MAX) return ref(doc, s, e);
  }
  const h = b ?? a;
  return h && hitRef(doc, h);
}

/** Start the quote late enough that the key phrase ending at `keyEnd` fits in it. */
function quoteFrom(doc: DocText, s: number, keyEnd: number): number {
  if (keyEnd - s <= QUOTE_MAX) return s;
  let i = keyEnd - QUOTE_MAX + 10;
  while (i < keyEnd && !/\s/.test(doc.text[i])) i++;
  return i + 1;
}

function sectionOf(hs: Heading[], title: RegExp, docEnd: number): [number, number] | undefined {
  const i = hs.findIndex((h) => title.test(h.title));
  return i < 0 ? undefined : [hs[i].end, hs[i + 1]?.start ?? docEnd];
}

// ---------------------------------------------------------------------------
// Calibration certificates
// ---------------------------------------------------------------------------

const CAL_DATE = new RegExp(
  String.raw`(?:Date\s+of\s+(?:calibration|verification|test)|Calibration\s+date|Calibrated\s+on|Date\s+calibrated)\s*:?\s*(${DATE})`,
  "i",
);
const DUE_DATE = new RegExp(
  String.raw`(?:Next\s+(?:calibration\s+)?due(?:\s+date)?|Next\s+calibration(?:\s+date)?|Re-?calibration\s+due|Due\s+date|Valid\s+until|Expiry\s+date)\s*(?:on|by)?\s*:?\s*(${DATE})`,
  "i",
);

export function calibrationFacts(doc: DocText, warnings: string[]): CalibrationFact[] {
  const heads = findAll(doc, /^[^\S\n]*(?:certificate\s+of\s+calibration|calibration\s+certificate)\b/im).map((h) => h.start);
  const bounds = heads.length
    ? heads.map((s, i) => [s, heads[i + 1] ?? doc.text.length] as const)
    : doc.starts.map((s, i) => [s, s + doc.pages[i].text.length] as const);
  const facts: CalibrationFact[] = [];
  for (const [s, e] of bounds) {
    const tagHit =
      find(doc, new RegExp(String.raw`\bTag(?:\s*(?:\/|and)\s*serial)?(?:\s+(?:number|no\.?))?\s*[:#]?\s*(${TAG})`, "i"), s, e) ??
      find(doc, new RegExp(String.raw`^[^\S\n]*(${TAG})[^\S\n]*(?::|–|—|\s-)`, "m"), s, e) ??
      find(doc, new RegExp(`(${METER_TAG.source})`), s, e);
    if (!tagHit) continue;
    const tag = tagHit.m[1].toUpperCase();
    const service =
      find(doc, new RegExp(String.raw`^[^\S\n]*${escapeRe(tag)}[^\S\n]*(?::|–|—|\s-)[^\S\n]*([^\n]+)$`, "mi"), s, e) ??
      find(doc, /^[^\S\n]*(?:Service|Duty|Application)\s*:?[^\S\n]+([^\n]+)$/im, s, e);
    const cert = find(doc, new RegExp(String.raw`Certificate\s+(?:number|no\.?|#|ref(?:erence)?)\s*[:#]?\s*(${ID})`, "i"), s, e);
    const cal = find(doc, CAL_DATE, s, e);
    const due = find(doc, DUE_DATE, s, e);
    const fact = compact<CalibrationFact>({
      tag,
      service: service && collapse(service.m[1]),
      certificateNo: cert?.m[1],
      calibratedOn: cal && parseDate(cal.m[1]),
      nextDue: due && parseDate(due.m[1]),
      result: calibrationResult(doc, s, e),
      evidence: pairRef(doc, cal, due) ?? hitRef(doc, tagHit),
    });
    if (!fact.nextDue) warnings.push(`${doc.document.fileName}: no next calibration due date found for ${tag}`);
    facts.push(fact);
  }
  if (!facts.length) warnings.push(`${doc.document.fileName}: no calibration certificate recognised`);
  return facts;
}

function calibrationResult(doc: DocText, s: number, e: number): string | undefined {
  const verdicts = findAll(doc, /\b(PASS(?:ED)?|FAIL(?:ED)?)\b/i, s, e).map((h) => h.m[1].toUpperCase());
  if (verdicts.some((v) => v.startsWith("FAIL"))) return "FAIL";
  if (verdicts.length) return "PASS";
  if (find(doc, /\b(?:not\s+within|outside|exceed\w*)\s+(?:the\s+)?(?:acceptance|tolerance|permissible)\s+limits?|\bnot\s+fit\s+for\s+(?:use|purpose)/i, s, e)) return "FAIL";
  if (find(doc, /\bwithin\s+(?:the\s+)?(?:acceptance|tolerance|permissible)\s+limits?|\bfit\s+for\s+(?:use|purpose)/i, s, e)) return "PASS";
  return undefined;
}

// ---------------------------------------------------------------------------
// Gas analysis certificate
// ---------------------------------------------------------------------------

type GasRow = "ef" | "ncv" | "flareCo2" | "flareCh4";
const GAS_ROWS: [GasRow, RegExp, "fuel" | "any"][] = [
  ["ef", /(?:CO2\s+)?emission\s+factor[^\n]*?(?:t|tonnes?)\s*CO2\s*\/\s*TJ\)?/i, "fuel"],
  ["ncv", /(?:net\s+calorific\s+value|\bNCV\b|lower\s+heating\s+value|\bLHV\b)[^\n]*?MJ\s*\/\s*S?m3\)?/i, "fuel"],
  ["flareCo2", /CO2\s+per\s+(?:10\s*\^?\s*3|1,?000|thousand)\s*S?m3[^\n]*?\((?:t|tonnes?)\)/i, "any"],
  ["flareCh4", /CH4\s+per\s+(?:10\s*\^?\s*3|1,?000|thousand)\s*S?m3[^\n]*?\((?:t|tonnes?)\)/i, "any"],
];

function sampleStream(point: string, id: string): GasSampleFact["stream"] {
  if (/flare/i.test(point)) return "flare";
  if (/fuel/i.test(point)) return "fuel";
  if (/(?:^|[-_])FL(?:[-_]|$)/i.test(id)) return "flare";
  if (/(?:^|[-_])FG(?:[-_]|$)/i.test(id)) return "fuel";
  return "other";
}

export function gasAnalysisFacts(doc: DocText, warnings: string[]): GasAnalysisFact {
  const evidence: EvidenceRef[] = [];
  const report = find(doc, new RegExp(String.raw`(?:Report|Certificate|Analysis)\s+(?:number|no\.?|ref(?:erence)?)\s*[:#]?\s*(${ID})`, "i"));
  const issued = find(
    doc,
    new RegExp(String.raw`(?:Date\s+of\s+(?:issue|report)|Issue\s+date|Date\s+issued|Issued\s+on|Report\s+date)\s*:?\s*(${DATE})`, "i"),
  );
  const head = pairRef(doc, report, issued);
  if (head) evidence.push(head);

  const samples: GasSampleFact[] = [];
  const headerAt = doc.lines.findIndex((l) => /\bsample\s+(?:id|no\.?|number|ref)/i.test(l.text));
  const sampleRe = new RegExp(
    String.raw`^\s*(?=[A-Z0-9\-\/_.]*\d)(?=[\d\-\/_.]*[A-Z])([A-Z0-9][A-Z0-9\-\/_.]{3,})\s+(.*?[A-Z].*?)\s+(${DATE})`,
    "i",
  );
  for (const l of doc.lines.slice(Math.max(0, headerAt))) {
    const m = sampleRe.exec(l.text);
    if (!m || samples.some((x) => x.sampleId === m[1])) continue;
    const point = collapse(m[2]);
    samples.push(compact({ sampleId: m[1], samplingPoint: point, stream: sampleStream(point, m[1]), sampledOn: parseDate(m[3]) }));
    if (samples.length === 1) evidence.push(ref(doc, l.start, l.end));
  }

  // Property tables: the stream comes from the latest "Results: fuel gas / flare" heading; values from the Mean column.
  const found: Partial<Record<GasRow, number>> = {};
  let stream: "fuel" | "flare" | undefined;
  let meanLast = false;
  for (const l of doc.lines) {
    const heading = /^\s*(?:results?|analysis|composition|properties)\b[^\n]*?\b(fuel|flare)/i.exec(l.text);
    if (heading) {
      stream = heading[1].toLowerCase() === "fuel" ? "fuel" : "flare";
      continue;
    }
    if (/^\s*(?:component|calculated\s+propert|propert|parameter|analyte)/i.test(l.text)) meanLast = /\b(?:mean|average)\s*$/i.test(l.text);
    for (const [key, label, want] of GAS_ROWS) {
      if (found[key] !== undefined || (want === "fuel" && stream === "flare")) continue;
      const m = label.exec(l.text);
      const nums = m ? rowNumbers(l.text.slice(m.index + m[0].length)) : [];
      if (!nums.length) continue;
      found[key] = meanLast || nums.length === 1 ? nums[nums.length - 1] : round(nums.reduce((a, b) => a + b, 0) / nums.length, decimals(nums));
      evidence.push(ref(doc, l.start, l.end));
    }
  }
  if (found.ef === undefined) {
    const h = find(doc, /(?:mean|average|annual)[^.\n]{0,60}?emission\s+factor[^\d\n]{0,40}?(\d+(?:\.\d+)?)\s*t\s*CO2\s*\/\s*TJ/i);
    if (h) {
      found.ef = parseNum(h.m[1]);
      evidence.push(hitRef(doc, h));
    }
  }
  if (found.ef === undefined) warnings.push(`${doc.document.fileName}: fuel gas emission factor (mean) not found`);
  if (!samples.length) warnings.push(`${doc.document.fileName}: no gas samples recognised`);
  return compact<GasAnalysisFact>({
    reportNo: report?.m[1],
    issuedOn: issued && parseDate(issued.m[1]),
    samples,
    fuelEfMeanTco2PerTj: found.ef,
    fuelNcvMeanMjPerSm3: found.ncv,
    flareCo2FactorTPer1000Sm3: found.flareCo2,
    flareCh4FactorTPer1000Sm3: found.flareCh4,
    evidence: dedupeRefs(evidence),
  });
}

// ---------------------------------------------------------------------------
// Verification statement
// ---------------------------------------------------------------------------

const OPINIONS: [VerificationOpinion, RegExp][] = [
  ["adverse", /\badverse\s+(?:opinion|conclusion)\b/i],
  ["disclaimer", /\bdisclaimer\s+of\s+(?:opinion|conclusion)\b|\b(?:do|does|did)\s+not\s+express\s+an?\s+(?:opinion|conclusion)\b|\bunable\s+to\s+express\b/i],
  ["qualified", /\bqualified\s+(?:opinion|conclusion)\b|\bexcept\s+for\s+the\s+(?:possible\s+)?effects?\b/i],
  [
    "unmodified",
    /\b(?:unmodified|unqualified|positive|clean)\s+(?:opinion|conclusion)\b|\bfree\s+from\s+material\s+misstatements?\b|\bfairly\s+stated\b|\bnothing\s+has\s+come\s+to\s+our\s+attention\b/i,
  ],
];
const CLASSIFICATION =
  /^(?:misstatements?(?:,?\s*(?:un)?corrected)?|(?:major\s+|minor\s+)?non-?\s*conformit(?:y|ies)(?:,?\s*(?:un)?resolved)?|observations?|opportunit(?:y|ies)\s+for\s+improvement|recommendations?|clarification(?:\s+requests?)?|(?:major|minor)\s+(?:findings?|issues?))\b[,:;]?\s*/i;
const FINDING_STATUS = /^(?:open|closed|resolved|unresolved|outstanding|pending|corrected|not\s+resolved)(?=[\s.,;:()]|$)/i;
const EXCLUSION =
  /\bexclu(?:ded|des|ding|sion)\b|\b(?:does|do|did)\s+not\s+cover\b|\bnot\s+covered\b|\boutside\s+(?:the\s+)?(?:verification\s+)?scope\b|\bnot\s+(?:included\s+in|within)\s+(?:the\s+)?scope\b/i;
const NO_EXCLUSION = /\bno\s+(?:\w+\s+)?exclusions?\b|\bwithout\s+(?:any\s+)?exclusions?\b|\b(?:nothing|none)\s+(?:was\s+|were\s+)?excluded\b/i;

/** "resolved" | "unresolved" | "open" | other text (lower case), from the classification and status columns. */
export function normalizeFindingStatus(classification: string, status: string): string {
  const c = classification.toLowerCase();
  const s = collapse(status.toLowerCase());
  if (/\bun(?:resolved|corrected)\b|\bnot\s+(?:resolved|corrected)\b/.test(`${c} ${s}`)) return "unresolved";
  if (/^(?:closed|resolved|corrected)\b/.test(s) || (!s && /\b(?:corrected|resolved)\b/.test(c))) return "resolved";
  if (/^(?:open|outstanding|pending)\b/.test(s)) return "open";
  return s.split(/[.(]/)[0].trim() || "unknown";
}

export function verificationFacts(doc: DocText, warnings: string[]): VerificationFact {
  const hs = headings(doc);
  const evidence: EvidenceRef[] = [];
  const reference = find(doc, new RegExp(String.raw`(?:Statement|Verification|Report|Opinion)\s+(?:reference|ref\.?|number|no\.?)\s*[:#]?\s*(${ID})`, "i"));
  const date =
    find(
      doc,
      new RegExp(
        String.raw`(?:Date\s+of\s+(?:the\s+)?(?:statement|issue|verification(?:\s+statement)?|opinion|signature)|Statement\s+date|Issue\s+date)\s*:?\s*(${DATE})`,
        "i",
      ),
    ) ?? find(doc, new RegExp(String.raw`\bDate\s*:?\s*(${DATE})`, "i"));
  const head = pairRef(doc, reference, date);
  if (head) evidence.push(head);

  const body =
    find(doc, /^[^\S\n]*(?:Verification\s+body|Verifier|Verified\s+by|Verifying\s+(?:body|organi[sz]ation))\s*:?[^\S\n]+([^\n]+)$/im) ??
    find(doc, COMPANY, 0, firstPageEnd(doc));
  if (body) evidence.push(hitRef(doc, body));
  const assurance = find(doc, /\b(reasonable|limited)\s+(?:level\s+of\s+)?assurance\b/i);
  const materiality = find(doc, /materiality[^%]{0,80}?(\d+(?:\.\d+)?)\s*%|(\d+(?:\.\d+)?)\s*%\s*materiality/i);
  for (const h of [assurance, materiality]) if (h) evidence.push(lineRef(doc, h));

  let opinion: VerificationOpinion = "unknown";
  const opinionSection = sectionOf(hs, /opinion|conclusion/i, doc.text.length);
  for (const [from, to] of opinionSection ? [opinionSection, [0, doc.text.length]] : [[0, doc.text.length]]) {
    for (const [kind, re] of OPINIONS) {
      const h = find(doc, re, from, to);
      if (!h) continue;
      opinion = kind;
      const sp = sentenceSpan(doc, h.start, h.end, { follow: 1, floor: from, ceil: to });
      evidence.push(ref(doc, quoteFrom(doc, sp.start, h.end), sp.end));
      break;
    }
    if (opinion !== "unknown") break;
  }
  if (opinion === "unknown") warnings.push(`${doc.document.fileName}: verification opinion not recognised`);

  const scopeExclusions: string[] = [];
  for (const h of findAll(doc, EXCLUSION)) {
    const sp = sentenceSpan(doc, h.start, h.end);
    const sentence = doc.text.slice(sp.start, sp.end);
    const ids = NO_EXCLUSION.test(sentence) ? [] : expandIds(sentence);
    if (!ids.length) continue;
    for (const id of ids) if (!scopeExclusions.includes(id)) scopeExclusions.push(id);
    evidence.push(ref(doc, quoteFrom(doc, sp.start, h.end), sp.end));
  }

  return compact<VerificationFact>({
    reference: reference?.m[1],
    date: date && parseDate(date.m[1]),
    body: body && titleCaps(body.m[1]),
    opinion,
    assuranceLevel: assurance && `${assurance.m[1][0].toUpperCase()}${assurance.m[1].slice(1).toLowerCase()} assurance`,
    materialityPct: materiality && parseNum(materiality.m[1] ?? materiality.m[2]),
    scopeExclusions,
    findings: findingFacts(doc, hs),
    evidence: dedupeRefs(evidence),
  });
}

function findingFacts(doc: DocText, hs: Heading[]): VerifierFindingFact[] {
  const [from, to] = sectionOf(hs, /finding|non-?conformit|misstatement/i, doc.text.length) ?? [0, doc.text.length];
  const first = find(doc, /^[^\S\n]*([A-Z]{1,4})-\d{1,3}\b/m, from, to);
  if (!first) return [];
  const heads = findAll(doc, new RegExp(String.raw`^[^\S\n]*(${first.m[1]}-\d{1,3})\b`, "m"), from, to);
  return heads.map((h, i) => {
    const end = heads[i + 1]?.start ?? to;
    const lines = doc.text
      .slice(h.end, end)
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !PAGE_LINE.test(l));
    // The status column is the last line(s) of the row, e.g. "Open." followed by a note.
    let si = lines.length - 1;
    while (si > 0 && !FINDING_STATUS.test(lines[si])) si--;
    const hasStatus = si > 0;
    let description = collapse((hasStatus ? lines.slice(0, si) : lines).join(" "));
    const classification = CLASSIFICATION.exec(description)?.[0] ?? "";
    description = description.slice(classification.length).trim();
    const impact =
      /(?:under|over|mis)statement\s+(?:of\s+)?(?:approximately\s+|about\s+|c\.\s*)?(\d[\d,]*(?:\.\d+)?)\s*t\s*CO2e?\b|impact\s+(?:of\s+)?(?:approximately\s+|about\s+)?(\d[\d,]*(?:\.\d+)?)\s*t\s*CO2e?\b/i.exec(
        description,
      );
    return compact<VerifierFindingFact>({
      id: h.m[1],
      description,
      status: normalizeFindingStatus(classification, hasStatus ? lines.slice(si).join(" ") : ""),
      impactTco2e: impact ? parseNum(impact[1] ?? impact[2]) : undefined,
      evidence: ref(doc, h.start, end),
    });
  });
}

// ---------------------------------------------------------------------------
// Monitoring plan
// ---------------------------------------------------------------------------

interface TopicRule {
  topic: MonitoringPlanTopic;
  patterns: RegExp[];
  limit?: number;
  before?: number;
  follow?: number;
  line?: boolean;
}

const PLAN_TOPICS: TopicRule[] = [
  {
    topic: "methane_method",
    before: 1,
    follow: 1,
    patterns: [
      /(?:quantification|estimation|calculation)\s+(?:methodology|method|approach)[^.]{0,160}?(?:under\s+development|to\s+be\s+(?:developed|defined|determined|confirmed)|not\s+yet\s+(?:been\s+)?(?:defined|developed|established|available))/i,
      /(?:methane|CH4)[^.]{0,160}?(?:under\s+development|not\s+(?:yet\s+)?quantified)/i,
      /\ball\s+(?:methane|CH4)\s+sources[^.]{0,120}?quantified/i,
      /(?:methane|CH4)\s+(?:emissions?\s+)?(?:from|sources?)[^.]{0,160}?(?:calculated|quantified|estimated)/i,
    ],
  },
  {
    topic: "tank_venting",
    limit: 2,
    patterns: [
      /(?:pressure\s*\/\s*vacuum|\bP\s*\/\s*V|breather)\s+(?:relief\s+)?vents?(?:\s+to\s+(?:the\s+)?atmosphere)?/i,
      /\btanks?\b[^.]{0,120}?\bvent(?:s|ed|ing)?\s+(?:directly\s+)?to\s+(?:the\s+)?atmosphere/i,
    ],
  },
  {
    topic: "data_gap_procedure",
    follow: 2,
    patterns: [
      /(?:missing|unavailable|lost)\s+data[^.]{0,80}?substitut\w*/i,
      /substitut\w*[^.]{0,120}?(?:average|mean)/i,
      /data\s+gaps?[^.]{0,120}?(?:substitut|estimat|fill)\w*/i,
    ],
  },
  {
    topic: "reconciliation_control",
    patterns: [
      /reconcil\w*[^.]{0,200}\.\s+(?:Deviations?|Differences?|Discrepanc\w+|Variances?)\s+(?:greater|more|higher|larger)\s+than\s+\d+(?:\.\d+)?\s*%/i,
      /(?:deviations?|differences?|discrepanc\w+)\s+(?:greater|more|higher|larger|above|exceeding)\s+(?:than\s+)?\d+(?:\.\d+)?\s*%[^.]*investigat/i,
      /reconcil\w*[^.]{0,160}?gas\s+balance/i,
    ],
  },
  {
    topic: "emission_factor_method",
    line: true,
    patterns: [
      /^[^\S\n]*EF\s+fuel\s+gas\b[^\n]*/im,
      /(?:emission\s+factor|\bEF\b)[^.\n]{0,120}?site-specific/i,
      /site-specific[^.\n]{0,80}?(?:emission\s+factor|\bEF\b)/i,
    ],
  },
];

export function monitoringPlanFacts(doc: DocText, warnings: string[]): MonitoringPlanFact {
  const hs = headings(doc);
  const documentNo =
    find(doc, new RegExp(String.raw`Document\s+(?:number|no\.?|ref(?:erence)?)\s*[:#]?\s*(${ID})`, "i")) ??
    find(doc, /\b([A-Z0-9]+(?:-[A-Z0-9]+)*-MP-\d{2,4})\b/);
  const revision = find(doc, /\bRev(?:ision)?\.?(?:\s*\/\s*date)?\s*[:#]?\s*(?:Rev(?:ision)?\.?\s*)?(\d+(?:\.\d+)?)\b/i);
  const date =
    find(doc, new RegExp(String.raw`Revision[^\n]{0,40}?(${DATE})`, "i")) ??
    find(doc, new RegExp(String.raw`(?:Date\s+of\s+(?:issue|revision|approval)|Issue\s+date|Effective\s+date|Date)\s*:?\s*(${DATE})`, "i"));

  const statements: PlanStatementFact[] = [];
  for (const rule of PLAN_TOPICS) {
    const limit = rule.limit ?? 1;
    const sections = new Set<string>();
    for (const re of rule.patterns) {
      for (const h of findAll(doc, re)) {
        if (sections.size >= limit) break;
        const sec = sectionAt(hs, h.start, doc.text.length);
        const key = sec.heading?.number ?? "";
        if (sections.has(key)) continue;
        sections.add(key);
        const sp = sentenceSpan(doc, h.start, h.end, { floor: sec.floor, ceil: sec.ceil, follow: rule.follow, before: rule.before, line: rule.line });
        statements.push(
          compact<PlanStatementFact>({
            topic: rule.topic,
            section: sec.heading?.number,
            text: collapse(doc.text.slice(sp.textStart, sp.end)),
            evidence: ref(doc, quoteFrom(doc, sp.start, h.end), sp.end),
          }),
        );
      }
      if (sections.size >= limit) break;
    }
  }

  const cal =
    find(doc, /calibrat\w*\s+(?:interval|frequency)[^.]{0,200}?\b(\d{1,2}\s*(?:months?|years?)|annual(?:ly)?|yearly)\b/i) ??
    find(doc, /calibrat\w*[^.\n]{0,80}?\b(?:every|at\s+least\s+(?:once\s+)?(?:every|a|per))\s+(\d{0,2}\s*(?:months?|years?))\b/i);
  if (cal) {
    const sec = sectionAt(hs, cal.start, doc.text.length);
    const tags = [...new Set(findAll(doc, METER_TAG, sec.floor, sec.ceil).map((h) => h.m[0]))];
    statements.push(
      compact<PlanStatementFact>({
        topic: "meter_calibration",
        section: sec.heading?.number,
        text: `Calibration interval ${collapse(cal.m[1])}${tags.length ? ` for ${tags.join(", ")}` : ""}`,
        evidence: hitRef(doc, cal),
      }),
    );
  }
  if (!statements.length) warnings.push(`${doc.document.fileName}: no monitoring plan statements recognised`);
  return compact<MonitoringPlanFact>({
    documentNo: documentNo?.m[1],
    revision: revision?.m[1],
    date: date && parseDate(date.m[1]),
    statements,
  });
}

// ---------------------------------------------------------------------------
// Cover letter
// ---------------------------------------------------------------------------

const CLAIMS: [DeclarationFact["claim"], RegExp][] = [
  ["complete_and_accurate", /\bcomplete\s+and\s+accurate\b|\baccurate\s+and\s+complete\b|\btrue,?\s+(?:complete|accurate)\b/i],
  [
    "no_data_gaps",
    /\bno\s+data\s+gaps?\b|\bdata\s+gaps?\s*:?\s+none\b|\bwithout\s+(?:any\s+)?data\s+gaps?\b|\bno\s+(?:gaps\s+in\s+(?:the\s+)?(?:monitoring\s+)?data|missing\s+data)\b/i,
  ],
  ["verified", /\b(?:has|have)\s+been\s+(?:independently\s+)?verified\b|\bverified\s+by\s+(?:an?\s+)?(?:accredited|independent)\b|\b(?:independently|third-party)\s+verified\b/i],
  // Any other statement about data gaps (e.g. a disclosed gap).
  ["other", /\bdata\s+gaps?\b/i],
];

export function coverLetterFacts(doc: DocText, warnings: string[]): CoverLetterFact {
  const reference = find(doc, new RegExp(String.raw`(?:\bOur\s+ref(?:erence)?|\bRef(?:erence)?(?:\s+(?:no\.?|number))?)\s*[:.]?\s*(${ID})`, "i"));
  const date = find(doc, new RegExp(String.raw`\bDated?\s*:?\s*(${DATE})`, "i")) ?? find(doc, new RegExp(`(${DATE})`, "i"));
  const total = find(
    doc,
    /\bTotal\s+(?:Scope\s*1\s+)?(?:GHG\s+|greenhouse\s+gas\s+|direct\s+)?emissions?[^\d\n]{0,40}?(\d[\d,]*(?:\.\d+)?)\s*(?:t|tonnes?)\s*CO2\s*-?\s*e(?:q)?\b/i,
  );
  const declarations: DeclarationFact[] = [];
  const used = new Set<number>();
  for (const [claim, re] of CLAIMS) {
    for (const h of findAll(doc, re)) {
      const sp = sentenceSpan(doc, h.start, h.end);
      if (used.has(sp.start)) continue;
      used.add(sp.start);
      declarations.push({ claim, text: collapse(doc.text.slice(sp.start, sp.end)), evidence: ref(doc, quoteFrom(doc, sp.start, h.end), sp.end) });
      break;
    }
  }
  if (!total) warnings.push(`${doc.document.fileName}: reported total emissions not found`);
  return compact<CoverLetterFact>({
    reference: reference?.m[1],
    date: date && parseDate(date.m[1]),
    reportedTotalTco2e: total && parseNum(total.m[1]),
    declarations,
  });
}

// ---------------------------------------------------------------------------
// LDAR survey summary
// ---------------------------------------------------------------------------

type LdarColumn = "componentsSurveyed" | "leaksFound" | "leaksRepaired" | "ch4T";
const LDAR_COLUMNS: [LdarColumn, RegExp][] = [
  ["componentsSurveyed", /component/i],
  ["leaksFound", /leaks?\s+(?:detected|found|identified)|\bleaks\b/i],
  ["leaksRepaired", /repair/i],
  ["ch4T", /\bCH4\b|methane|emissions?/i],
];

export function ldarFacts(doc: DocText, warnings: string[]): LdarFact {
  const evidence: EvidenceRef[] = [];
  const contractor =
    find(doc, /^[^\S\n]*(?:Contractor|LDAR\s+contractor|Survey\s+(?:contractor|company|provider)|Service\s+provider|Surveyed\s+by)\s*:?[^\S\n]+([^\n]+)$/im) ??
    find(doc, COMPANY, 0, firstPageEnd(doc));
  if (contractor) evidence.push(hitRef(doc, contractor));

  // Column order comes from the table header; rows are "<period> <date> <numbers...>".
  const headerAt = doc.lines.findIndex((l) => /component/i.test(l.text) && /leak/i.test(l.text));
  const header = headerAt >= 0 ? doc.lines[headerAt].text : "";
  const found = LDAR_COLUMNS.map(([key, re]) => ({ key, at: header.search(re) }))
    .filter((c) => c.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((c) => c.key);
  const columns = found.length >= 2 ? found : LDAR_COLUMNS.map(([key]) => key);
  const rowRe = new RegExp(String.raw`^\s*(?:(.+?)\s+)?(${DATE})\s+((?:-?\d[\d,]*(?:\.\d+)?\s*){2,})$`, "i");
  const surveys: LdarSurveyFact[] = [];
  let lastRow = headerAt;
  for (let i = headerAt + 1; i < doc.lines.length; i++) {
    const l = doc.lines[i];
    const m = rowRe.exec(l.text);
    if (!m) continue;
    const nums = rowNumbers(m[3]);
    const cols = nums.length === columns.length - 1 ? columns.filter((c) => c !== "leaksRepaired") : columns;
    const survey: LdarSurveyFact = { period: collapse(m[1] ?? "") || (parseDate(m[2]) ?? m[2]), surveyedOn: parseDate(m[2]) };
    cols.forEach((c, j) => {
      if (nums[j] !== undefined) survey[c] = nums[j];
    });
    surveys.push(compact(survey));
    evidence.push(ref(doc, l.start, l.end));
    lastRow = i;
  }

  let annualCh4T: number | undefined;
  const withCh4 = surveys.filter((s) => s.ch4T !== undefined);
  const sum = withCh4.reduce((a, s) => a + (s.ch4T ?? 0), 0);
  const totalLine = surveys.length ? doc.lines.slice(lastRow + 1).find((l) => /^\s*Total\b/i.test(l.text)) : undefined;
  const k = columns.indexOf("ch4T");
  if (totalLine && k >= 0) {
    const nums = rowNumbers(totalLine.text);
    const v = nums[nums.length - (columns.length - k)];
    if (v !== undefined && (!withCh4.length || Math.abs(v - sum) <= Math.max(0.5, 0.02 * sum))) {
      annualCh4T = v;
      evidence.push(ref(doc, totalLine.start, totalLine.end));
    }
  }
  if (annualCh4T === undefined) {
    const h = find(doc, /(?:annual|total)\s+(?:estimated\s+)?(?:CH4|methane)(?:\s+emissions?)?[^\d\n]{0,30}?(\d[\d,]*(?:\.\d+)?)\s*t\b/i);
    if (h) {
      annualCh4T = parseNum(h.m[1]);
      evidence.push(hitRef(doc, h));
    } else if (withCh4.length) annualCh4T = round(sum, decimals(withCh4.map((s) => s.ch4T ?? 0)));
  }
  if (!surveys.length) warnings.push(`${doc.document.fileName}: no LDAR survey rows recognised`);
  return compact<LdarFact>({
    contractor: contractor && titleCaps(contractor.m[1]),
    surveys,
    annualCh4T,
    evidence: dedupeRefs(evidence),
  });
}

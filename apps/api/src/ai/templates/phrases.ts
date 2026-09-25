import type { EvidenceRef, FindingCategory, RegulationRule, ReviewMetrics } from "@zerocarbon/shared";
import { AR_MONTHS, fmtIntensity, fmtNum } from "../format.ts";

export const ORG_EN = "Environment Agency - Abu Dhabi (EAD)";
export const UNIT_EN = "Climate Change and Facility MRV";
export const ORG_AR = "هيئة البيئة - أبوظبي";
export const UNIT_AR = "إدارة التغير المناخي والرصد والإبلاغ والتحقق للمنشآت";
export const DRAFT_EN = "DRAFT prepared with ZeroCarbon.gov for officer review";
export const DRAFT_AR = "مسودة معدة باستخدام ZeroCarbon.gov لمراجعة الموظف المختص";
export const OFFICER_EN = "Reviewing Officer";
export const OFFICER_AR = "الموظف المختص بالمراجعة";
export const DL_EN = "Federal Decree-Law No. 11 of 2024 on the Reduction of Climate Change Effects";
export const DL_AR = "المرسوم بقانون اتحادي رقم (11) لسنة 2024 في شأن الحد من آثار التغير المناخي";
export const DL_SHORT_AR = "المرسوم بقانون اتحادي رقم (11) لسنة 2024";
export const TGD_EN = "the Agency's Technical Guidance for the Measurement, Reporting and Verification of Greenhouse Gas Emissions";
export const TGD_AR = "الدليل الفني للهيئة بشأن رصد انبعاثات غازات الدفيئة والإبلاغ عنها والتحقق منها";
export const SIGNAL_AR = "وهو مؤشر يستدعي التحقق ولا يُعد مخالفة بذاته";

// ---------------------------------------------------------------------------
// Per-category text
// ---------------------------------------------------------------------------

export interface CategoryText {
  /** Short label used in summaries and neutral notes. */
  topicEn: string;
  topicAr: string;
  /** Why it matters under the rules (narrative, no trailing period). */
  whyEn: string;
  /** What to ask the operator (narrative). */
  askEn: string;
  /** Required action in letters. */
  actionEn: string;
  actionAr: string;
  /** Arabic "what was found" sentence for letters; `ids` is "" or " (FT-5101، M-04 إلى M-08)". */
  foundAr: (ids: string) => string;
}

export const CATEGORY: Record<FindingCategory, CategoryText> = {
  data_gap: {
    topicEn: "data gaps",
    topicAr: "فجوات بيانات الرصد",
    whyEn:
      "EAD's guidance requires operators to prevent data gaps and to declare every gap or deviation from the Monitoring Plan in sheet H1, with the method used to fill it and its estimated impact, otherwise the affected emissions cannot be relied on",
    askEn: "Ask the operator to declare the gap in sheet H1, recalculate the affected period with a documented substitution method (such as the one in its own Monitoring Plan) and revise the plan.",
    actionEn:
      "Declare the data gap in sheet H1 with its cause, the substitution method and the estimated emissions impact, recalculate the affected period using a documented and verifiable method (for example the substitution procedure in your own Monitoring Plan), and submit a revised Monitoring Plan covering the period until metering is restored.",
    actionAr:
      "الإفصاح عن فجوة البيانات في الورقة H1 مع بيان سببها وطريقة الاستبدال المستخدمة والأثر التقديري على الانبعاثات، وإعادة احتساب الانبعاثات للفترة المتأثرة باستخدام طريقة موثقة وقابلة للتحقق (مثل إجراء الاستبدال الوارد في خطة الرصد الخاصة بالشركة)، وتقديم خطة رصد محدّثة تغطي الفترة إلى حين استئناف القياس.",
    foundAr: (ids) => `تبيّن وجود فجوة في بيانات الرصد${ids} لم يُفصح عنها في الورقة H1 ولم تُعالج بطريقة موثقة`,
  },
  evidence: {
    topicEn: "consistency with supporting evidence",
    topicAr: "اتساق البيانات المبلغ عنها مع الأدلة الداعمة",
    whyEn:
      "Reported figures must be transparent and reproducible from the supporting records, and a material mismatch with the operator's own data suggests that emissions may be understated",
    askEn: "Ask the operator for a documented month-by-month reconciliation and a correction of the report where the difference cannot be explained.",
    actionEn:
      "Provide a documented monthly reconciliation between the reported quantities and the supporting records, explain every material difference, and correct the reported figures where a difference cannot be explained.",
    actionAr:
      "تقديم مطابقة شهرية موثقة بين الكميات المبلغ عنها والسجلات الداعمة، وتفسير أي فروق جوهرية، وتصحيح الأرقام المبلغ عنها في حال تعذّر تفسير هذه الفروق.",
    foundAr: (ids) => `تبيّن أن الكميات المبلغ عنها${ids} لا تتسق مع السجلات والأدلة الداعمة المقدمة من الشركة نفسها`,
  },
  methane: {
    topicEn: "methane",
    topicAr: "انبعاثات الميثان",
    whyEn:
      "The report must cover all emission sources within the facility boundary, and a source can only be treated as de minimis on the basis of a quantified estimate",
    askEn: "Ask the operator to quantify each listed methane source with a documented method, or support any exclusion with a quantified estimate, and to update the Monitoring Plan.",
    actionEn:
      "Quantify the methane emissions from every identified source using a documented method, or support any de minimis claim with a quantified estimate, and update the Monitoring Plan accordingly.",
    actionAr:
      "تقدير انبعاثات الميثان كمياً من جميع المصادر المحددة وفق منهجية موثقة، أو دعم أي ادعاء بضآلة الانبعاثات بتقدير كمي، وتحديث خطة الرصد تبعاً لذلك.",
    foundAr: (ids) => `تبيّن أن انبعاثات الميثان من بعض المصادر${ids} لم تُقدَّر كمياً في التقرير، رغم أن وثائق المنشأة تحدد هذه المصادر`,
  },
  emission_factor: {
    topicEn: "emission factors",
    topicAr: "معاملات الانبعاث",
    whyEn:
      "EAD's guidance prefers local, site-specific emission factors where they are available, with IPCC defaults only as the fallback, and the factor applied must match the basis declared in the report",
    askEn: "Ask the operator to recalculate with the site-specific factor from its laboratory analyses and to explain why a different factor was used.",
    actionEn:
      "Recalculate the emissions using the site-specific emission factor from the laboratory analyses, consistent with the basis declared in the report and your own Monitoring Plan, and explain why a different factor was applied.",
    actionAr:
      "إعادة احتساب الانبعاثات باستخدام معامل الانبعاث الخاص بالموقع المستخلص من التحاليل المخبرية، بما يتسق مع الأساس المعلن في التقرير وفي خطة الرصد الخاصة بالشركة، مع بيان أسباب استخدام معامل مختلف.",
    foundAr: (ids) => `تبيّن أن معامل الانبعاث المستخدم${ids} لا يتوافق مع الأساس المعلن في التقرير ومع نتائج التحاليل المخبرية المقدمة`,
  },
  calculation: {
    topicEn: "calculations",
    topicAr: "الحسابات",
    whyEn: "Reported emissions must be reproducible from the activity data and calculation factors stated in the report",
    askEn: "Ask the operator to correct the calculation and provide the working file.",
    actionEn: "Review and correct the calculation, and provide the revised calculation workbook.",
    actionAr: "مراجعة الحسابات وتصحيحها، وتقديم ملف الحساب المعدّل.",
    foundAr: (ids) => `تبيّن وجود اختلاف بين القيم الواردة في التقرير${ids} ونتائج إعادة الاحتساب التي أجرتها الهيئة`,
  },
  completeness: {
    topicEn: "completeness",
    topicAr: "اكتمال التقرير",
    whyEn: "The report must contain all required information and cover all emissions within the facility boundary",
    askEn: "Ask the operator to supply the missing information and resubmit a complete report.",
    actionEn: "Provide the missing information and submit a complete report covering all emissions within the facility boundary.",
    actionAr: "استكمال المعلومات الناقصة وتقديم تقرير مكتمل يشمل جميع الانبعاثات ضمن حدود المنشأة.",
    foundAr: (ids) => `تبيّن أن التقرير لا يتضمن جميع المعلومات أو مصادر الانبعاثات المطلوبة${ids}`,
  },
  verification: {
    topicEn: "verification",
    topicAr: "بيان التحقق",
    whyEn:
      "Third-party verification is voluntary until 2027, but where a verification statement is submitted the operator's declarations must be consistent with it, and the verifier's recommendations must be taken into account",
    askEn: "Ask the operator to correct the declarations so that they reflect the verifier's opinion and scope exclusions, and to explain how the open verifier findings will be resolved.",
    actionEn:
      "Correct the declarations in the report and the cover letter so that they reflect the verifier's opinion and scope exclusions, and explain how the open verifier findings are addressed in the corrected report.",
    actionAr:
      "تصحيح الإقرارات الواردة في التقرير وخطاب التقديم بحيث تعكس رأي جهة التحقق والاستثناءات من نطاق التحقق، وبيان كيفية معالجة ملاحظات جهة التحقق المفتوحة في التقرير المصحح.",
    foundAr: (ids) => `تبيّن أن إقرارات المشغل لا تتسق مع بيان التحقق المرفق${ids}، بما في ذلك رأي جهة التحقق والاستثناءات من نطاق التحقق`,
  },
  declaration: {
    topicEn: "operator declarations",
    topicAr: "إقرارات المشغل",
    whyEn:
      "The operator's declaration must be accurate, and a declaration that contradicts the submitted evidence undermines confidence in the whole report",
    askEn: "Ask the operator to correct the declaration so that it reflects the actual data and verification position.",
    actionEn: "Correct the declarations so that they accurately reflect the data and the verification outcome, and provide an updated signed declaration.",
    actionAr: "تصحيح الإقرارات بحيث تعكس بدقة وضع البيانات ونتيجة التحقق، وتقديم إقرار موقّع محدّث.",
    foundAr: (ids) => `تبيّن أن إقرارات المشغل${ids} لا تتسق مع ما ورد في التقرير والأدلة الداعمة`,
  },
  deadline: {
    topicEn: "submission deadline",
    topicAr: "موعد التقديم",
    whyEn: "Reports must be submitted by the deadline set by the Agency",
    askEn: "Ask the operator to explain the delay.",
    actionEn: "Explain the reasons for the late submission and confirm the measures taken to meet future deadlines.",
    actionAr: "بيان أسباب التأخر في التقديم والتدابير المتخذة للالتزام بالمواعيد المحددة مستقبلاً.",
    foundAr: (ids) => `تبيّن أن التقرير قُدِّم بعد الموعد المحدد${ids}`,
  },
  benchmark: {
    topicEn: "peer comparison",
    topicAr: "المقارنة مع المنشآت المماثلة",
    whyEn:
      "This is a signal rather than a breach: an intensity well outside the range of comparable facilities can point to missing or understated sources",
    askEn: "Ask the operator to explain the difference, taking the other findings into account.",
    actionEn: "Provide a documented explanation of the difference between the facility's emissions intensity and that of comparable facilities.",
    actionAr: "تقديم تفسير موثق للفرق بين كثافة انبعاثات المنشأة وكثافة انبعاثات المنشآت المماثلة.",
    foundAr: (ids) => `تقع كثافة الانبعاثات المبلغ عنها${ids} خارج النطاق المعتاد للمنشآت المماثلة، ${SIGNAL_AR}`,
  },
  trend: {
    topicEn: "year-on-year trend",
    topicAr: "التغير مقارنة بالسنة السابقة",
    whyEn:
      "This is a signal rather than a breach: a change in emissions that does not follow production needs an explanation, such as a documented mitigation measure",
    askEn: "Ask the operator to explain the change and to support any claimed reductions with evidence.",
    actionEn: "Explain the change in reported emissions compared with the previous year and support any claimed reductions with evidence.",
    actionAr: "تفسير التغير في الانبعاثات المبلغ عنها مقارنة بالسنة السابقة، ودعم أي تخفيضات مُدّعاة بالأدلة.",
    foundAr: (ids) => `تبيّن أن التغير في الانبعاثات المبلغ عنها مقارنة بالسنة السابقة${ids} لا يتسق مع التغير في مستوى الإنتاج، ${SIGNAL_AR}`,
  },
  satellite: {
    topicEn: "satellite signals",
    topicAr: "إشارات الرصد بالأقمار الاصطناعية",
    whyEn:
      "Satellite detections are signals to investigate, not proof, but a detection that coincides with a logged event or an undeclared source warrants an explanation",
    askEn: "Ask the operator to explain the operating events at the detection times and to provide the related logs and emission estimates.",
    actionEn:
      "Explain the operating events at the times of the detections, and provide the related operating logs and an estimate of the associated emissions.",
    actionAr: "تفسير الأحداث التشغيلية في أوقات الرصد، وتقديم السجلات التشغيلية ذات الصلة وتقدير للانبعاثات المرتبطة بها.",
    foundAr: (ids) =>
      `رُصدت عبر الأقمار الاصطناعية إشارات لانبعاثات الميثان بالقرب من المنشأة${ids}، وهي إشارات تستدعي التحقق ولا تُعد دليلاً قاطعاً بذاتها`,
  },
};

/** Metric-based sentences for peer and trend signals (known ReviewMetrics fields), in both languages, without a final period. */
export function benchmarkSentence(m: ReviewMetrics): { en: string; ar: string } | undefined {
  if (m.intensityKgCo2ePerBoe == null || m.peerMedianIntensity == null) return undefined;
  const i = fmtIntensity(m.intensityKgCo2ePerBoe);
  const med = fmtIntensity(m.peerMedianIntensity);
  const range = m.peerMinIntensity != null && m.peerMaxIntensity != null;
  const min = range ? fmtIntensity(m.peerMinIntensity!) : "";
  const max = range ? fmtIntensity(m.peerMaxIntensity!) : "";
  return {
    en: `The reported intensity of ${i} kg CO2e/boe compares with a peer median of ${med} kg CO2e/boe${range ? ` (peer range ${min} to ${max})` : ""}`,
    ar: `بلغت كثافة الانبعاثات المبلغ عنها ${i} كغ CO2e لكل برميل مكافئ، مقارنة بوسيط قدره ${med} كغ CO2e لكل برميل مكافئ لدى المنشآت المماثلة${range ? ` (النطاق من ${min} إلى ${max})` : ""}`,
  };
}

export function trendSentence(m: ReviewMetrics): { en: string; ar: string } | undefined {
  if (m.yoyTotalPct == null) return undefined;
  const pct = (n: number) => `${fmtNum(Math.abs(n), 1, 1)}%`;
  const t = m.yoyTotalPct;
  const p = m.yoyProductionPct;
  const en = `Reported emissions ${t < 0 ? "fell" : "rose"} by ${pct(t)} compared with the previous year${p != null ? `, while production ${p < 0 ? "fell" : "rose"} by ${pct(p)}` : ""}`;
  const ar = `${t < 0 ? "انخفضت" : "ارتفعت"} الانبعاثات المبلغ عنها بنسبة ${pct(t)} مقارنة بالسنة السابقة${p != null ? `، في حين ${p < 0 ? "انخفض" : "ارتفع"} الإنتاج بنسبة ${pct(p)}` : ""}`;
  return { en, ar };
}

// ---------------------------------------------------------------------------
// Arabic citations and locators
// ---------------------------------------------------------------------------

/** Arabic "according to" prefix: "ل" + "المادة" becomes "للمادة". */
export const withLi = (s: string) => (s.startsWith("ال") ? `ل${s.slice(1)}` : `لـ${s}`);

const CLAUSE_AR: Record<string, string> = { a: "أ", b: "ب", c: "ج", d: "د", e: "هـ" };
const clausesAr = (s: string) => s.replace(/\(([a-e])\)/g, (_, l: string) => `(${CLAUSE_AR[l]})`);

/** "6(1)" -> "البند (1) من المادة (6)"; "15" -> "المادة (15)"; "6(1)(c), 6(3) and 14" -> "المواد 6(1)(ج) و6(3) و14". */
function articlesAr(list: string): string {
  const items = list.split(/,\s*|\s+and\s+/).map((s) => s.trim()).filter(Boolean);
  if (items.length === 1) {
    const m = items[0].match(/^(\d+)(?:\((\d+)\))?$/);
    if (m) return m[2] ? `البند (${m[2]}) من المادة (${m[1]})` : `المادة (${m[1]})`;
    return `المادة ${clausesAr(items[0])}`;
  }
  return `${items.length === 2 ? "المادتان" : "المواد"} ${items.map(clausesAr).join(" و")}`;
}

const LOCATION_AR: [RegExp, string][] = [
  [/\btemplate sheets\b/gi, "أوراق النموذج"],
  [/\btemplate sheet\b/gi, "ورقة النموذج"],
  [/\bFAQ Q(\d+)/g, "الأسئلة الشائعة، السؤال $1"],
  [/\(Operators\)/g, "(المشغلون)"],
  [/\bs\.\s*(\d)/g, "القسم $1"],
  [/\bSteps\b/g, "الخطوات"],
  [/\bStep\b/g, "الخطوة"],
  [/\bApp\.\s*/g, "الملحق "],
  [/\bAnnex\b/g, "الملحق"],
  [/\bArts\.\s*/g, "المواد "],
  [/\bArt\.\s*/g, "المادة "],
  [/\bslide\b/gi, "الشريحة"],
  [/\bVol\.\s*/g, "المجلد "],
  [/\bCh\.\s*/g, "الفصل "],
  [/\bTables\b/g, "الجداول"],
  [/\bTable\b/g, "الجدول"],
  [/\bpara\.\s*/g, "الفقرة "],
  [/\s+and\s+/g, " و"],
];

function locationAr(s: string): string {
  let out = clausesAr(s);
  for (const [re, ar] of LOCATION_AR) out = out.replace(re, ar);
  return monthsAr(out).replace(/,/g, "،");
}

const CITATION_PARTS: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Decree-Law 11\/2024,\s*Arts?\.\s*(.+)$/i, (m) => `${articlesAr(m[1])} من ${DL_SHORT_AR}`],
  [/^Cabinet Resolution (\d+)\/(\d{4})(?:,\s*(.+))?$/i, (m) => `قرار مجلس الوزراء رقم (${m[1]}) لسنة ${m[2]}${m[3] ? `، ${locationAr(m[3])}` : ""}`],
  [/^EAD TGD(?:\s*\(([^)]*)\))?(?:,\s*(.+))?$/i, (m) => `الدليل الفني للهيئة${m[1] ? ` (${monthsAr(m[1])})` : ""}${m[2] ? `، ${locationAr(m[2])}` : ""}`],
  [
    /^EAD MRV workshop(?:\s*\(([^)]*)\))?(?:,\s*(.+))?$/i,
    (m) => `ورشة عمل الهيئة حول الرصد والإبلاغ والتحقق${m[1] ? ` (${monthsAr(m[1])})` : ""}${m[2] ? `، ${locationAr(m[2])}` : ""}`,
  ],
  [/^(template sheets? .+|FAQ Q\d+)$/i, (m) => locationAr(m[1])],
];

const CITATION_FALLBACK_AR: Record<string, string> = {
  "IPCC-2006-DEFAULTS": "المبادئ التوجيهية للهيئة الحكومية الدولية المعنية بتغير المناخ لعام 2006 (IPCC 2006)",
  "IPCC-AR5-GWP": "تقرير التقييم الخامس للهيئة الحكومية الدولية المعنية بتغير المناخ (IPCC AR5)، إمكانية الاحترار العالمي على مدى 100 عام",
};

/** English words left after translation (identifiers such as 4h, H1, 3d1 or IPCC are fine). */
const hasEnglishWords = (s: string) =>
  (s.match(/[A-Za-z][A-Za-z0-9_\-./]*/g) ?? []).some((t) => !/[\d_]/.test(t) && !/^[A-Z]{1,6}$/.test(t) && !/^[a-z]$/.test(t));

/** Arabic rendering of a rule's `citation` string, part by part, e.g. "EAD TGD, Step 5" -> "الدليل الفني للهيئة، الخطوة 5". */
export function citationAr(rule: RegulationRule): string {
  const parts = rule.citation.split(/\s*;\s*/).map((part) => {
    for (const [re, render] of CITATION_PARTS) {
      const m = part.match(re);
      if (m) return render(m);
    }
    return undefined;
  });
  if (parts.every((p): p is string => Boolean(p) && !hasEnglishWords(p!))) return parts.join("؛ ");
  return CITATION_FALLBACK_AR[rule.id] ?? rule.titleAr ?? rule.citation;
}

const MONTH_NAMES = "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?";
const monthIndex = (name: string) => ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(name.slice(0, 3).toLowerCase());
const monthAr = (name: string) => AR_MONTHS[monthIndex(name)] ?? name;
function monthsAr(s: string): string {
  return s.replace(new RegExp(`\\b(${MONTH_NAMES})\\b`, "g"), (m) => monthAr(m));
}

const MONTH = "$month";
const LOCATOR_AR: [RegExp, string][] = [
  [/\bMonitoring Plan\b/gi, "خطة الرصد"],
  [/\bverification statement\b/gi, "بيان التحقق"],
  [/\bcover letter\b/gi, "خطاب التقديم"],
  [/\bflare log\b/gi, "سجل الشعلة"],
  [/\bgas balance\b/gi, "الموازنة الغازية"],
  [/\bsheets\b/gi, "الأوراق"],
  [/\bsheet\b/gi, "الورقة"],
  [/\bpages\b/gi, "الصفحات"],
  [/\bpage\b/gi, "الصفحة"],
  [/\brows\b/gi, "الصفوف"],
  [/\brow\b/gi, "الصف"],
  [/\bcolumns\b/gi, "الأعمدة"],
  [/\bcolumn\b/gi, "العمود"],
  [/\bsections\b/gi, "الأقسام"],
  [/\bsection\b/gi, "القسم"],
  [/\blines\b/gi, "البنود"],
  [/\bline\b/gi, "البند"],
  [/\bitems?\b/gi, "البند"],
  [/\btable\b/gi, "الجدول"],
  [/\bfigure\b/gi, "الشكل"],
  [/\bfrom\b/gi, "من"],
  [/\bto\b/gi, "إلى"],
  [/\band\b/gi, "و"],
  [new RegExp(`\\b(${MONTH_NAMES})\\b`, "g"), MONTH],
];

/** Arabic rendering of an evidence locator, or "" when it cannot be rendered cleanly. */
export function locatorAr(ev: EvidenceRef): string {
  let text = ev.locator ?? "";
  for (const [re, ar] of LOCATOR_AR) text = text.replace(re, (m) => (ar === MONTH ? monthAr(m) : ar));
  text = text.replace(/,/g, "،").replace(/\.\./g, " إلى ");
  const leftover = (text.match(/[A-Za-z][A-Za-z0-9_\-./]*/g) ?? []).filter((t) => !/[\d_]/.test(t) && !/^[A-Z]{1,6}$/.test(t) && !/^[a-z]$/.test(t));
  if (text.trim() && !leftover.length) return text.trim();
  const parts = [ev.sheet ? `الورقة ${ev.sheet}` : "", ev.page ? `الصفحة ${ev.page}` : "", ev.rows ? `الصفوف ${ev.rows.replace("..", " إلى ")}` : ""];
  return parts.filter(Boolean).join("، ");
}

// ---------------------------------------------------------------------------
// Facts pulled from English finding text for the Arabic templates
// ---------------------------------------------------------------------------

/** Equipment, source and line identifiers such as FT-5101, M-04 to M-08, T-401A/B, PTW-25-0418. */
export function extractIdsAr(text: string, exclude: string[] = []): string[] {
  const out: string[] = [];
  const re = /(?<![\w-])([A-Z]{1,4}-\d{1,5}[A-Z]?(?:\/[A-Z])?(?:-\d{1,5})*)(?:\s+to\s+([A-Z]{1,4}-\d{1,5}[A-Z]?))?(?![\w])/g;
  for (const m of text.matchAll(re)) {
    if (exclude.some((x) => x && x.includes(m[1]))) continue;
    const item = m[2] ? `${m[1]} إلى ${m[2]}` : m[1];
    if (!out.includes(item) && !out.some((o) => o.includes(m[1]))) out.push(item);
  }
  return out.slice(0, 6);
}

/** Dates, date ranges and month ranges, rendered in Arabic, in order of appearance. */
export function extractDatesAr(text: string): string[] {
  const M = `(${MONTH_NAMES})\\.?`;
  const ISO = String.raw`(\d{4})-(\d{2})-(\d{2})`;
  const iso = (y: string, m: string, d: string) => `${Number(d)} ${AR_MONTHS[Number(m) - 1]} ${y}`;
  const patterns: [RegExp, (m: RegExpMatchArray) => string][] = [
    [new RegExp(`\\b${ISO}\\s*(?:to|until|-|\\.\\.)\\s*${ISO}\\b`, "g"), (m) => `من ${iso(m[1], m[2], m[3])} إلى ${iso(m[4], m[5], m[6])}`],
    [new RegExp(`\\b(\\d{1,2})\\s*(?:to|-)\\s*(\\d{1,2}) ${M}(?: (\\d{4}))?\\b`, "g"), (m) => `من ${Number(m[1])} إلى ${Number(m[2])} ${monthAr(m[3])}${m[4] ? ` ${m[4]}` : ""}`],
    [
      new RegExp(`\\b(\\d{1,2}) ${M}(?: (\\d{4}))? (?:to|until|-) (\\d{1,2}) ${M}(?: (\\d{4}))?\\b`, "g"),
      (m) => `من ${Number(m[1])} ${monthAr(m[2])}${m[3] ? ` ${m[3]}` : ""} إلى ${Number(m[4])} ${monthAr(m[5])}${m[6] ? ` ${m[6]}` : ""}`,
    ],
    [new RegExp(`\\b${ISO}\\b`, "g"), (m) => iso(m[1], m[2], m[3])],
    [new RegExp(`\\b(\\d{1,2}) ${M}(?: (\\d{4}))?\\b`, "g"), (m) => `${Number(m[1])} ${monthAr(m[2])}${m[3] ? ` ${m[3]}` : ""}`],
    [new RegExp(`\\b${M} (?:to|until|-) ${M}(?: (\\d{4}))?\\b`, "g"), (m) => `من ${monthAr(m[1])} إلى ${monthAr(m[2])}${m[3] ? ` ${m[3]}` : ""}`],
    [new RegExp(`\\b${M} (\\d{4})\\b`, "g"), (m) => `${monthAr(m[1])} ${m[2]}`],
  ];
  const taken: [number, number][] = [];
  const found: { at: number; text: string }[] = [];
  for (const [re, render] of patterns) {
    for (const m of text.matchAll(re)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (taken.some(([a, b]) => start < b && end > a)) continue;
      taken.push([start, end]);
      found.push({ at: start, text: render(m) });
    }
  }
  return [...new Set(found.sort((a, b) => a.at - b.at).map((f) => f.text))].slice(0, 6);
}

const UNITS: [string, string][] = [
  ["kg CO2e/boe", "كغ CO2e لكل برميل مكافئ"],
  ["t CH4/MMboe", "طن CH4 لكل مليون برميل مكافئ"],
  ["t CO2/TJ", "طن CO2 لكل تيراجول"],
  ["t CO2e/yr", "طن CO2e سنوياً"],
  ["t CO2e", "طن CO2e"],
  ["t CO2", "طن CO2"],
  ["t CH4", "طن CH4"],
  ["kg CH4/h", "كغ CH4 في الساعة"],
  ["kg/h", "كغ في الساعة"],
  ["MJ/Sm3", "ميغاجول لكل Sm3"],
  ["Sm3/d", "Sm3 يومياً"],
  ["Sm3", "Sm3"],
  ["MMboe", "مليون برميل مكافئ"],
  ["TJ", "تيراجول"],
  ["bbl", "برميل"],
  ["%", "%"],
  ["t", "طن"],
];
const NUM = String.raw`(?<![\w.])[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const FIGURE_RE = new RegExp(
  `(${NUM})(?:\\s*(vs\\.?|versus|against|compared with|to)\\s*(${NUM}))?\\s?(${UNITS.map(([u]) => escapeRe(u)).join("|")})(?![A-Za-z0-9])`,
  "g",
);

/** Numbers with units ("8,680,437 vs 22,976,806 Sm3", "62.2%"), rendered in Arabic. */
export function extractFiguresAr(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(FIGURE_RE)) {
    const unit = UNITS.find(([u]) => u === m[4])?.[1] ?? m[4];
    const withUnit = (n: string) => (unit === "%" ? `${n}%` : `${n} ${unit}`);
    const item = m[3] ? `${m[1]} ${m[2] === "to" ? "إلى" : "مقابل"} ${withUnit(m[3])}` : withUnit(m[1]);
    if (!out.includes(item)) out.push(item);
  }
  return out.slice(0, 6);
}

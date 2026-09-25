import type { DecisionAction, EvidenceRef, Finding, FindingCategory, LetterContent, RegulationRule } from "@zerocarbon/shared";
import type { LetterInput, SubmissionIdentity } from "../../types.ts";
import {
  addDays,
  bySeverity,
  daysAr,
  ensurePeriod,
  fmtDateAr,
  fmtDateEn,
  fmtIntensity,
  fmtNum,
  fmtPct,
  fmtT,
  gstToday,
  isActionable,
  knownRuleIds,
  parseIsoDate,
  ruleIndex,
  stripPeriod,
} from "../format.ts";
import {
  CATEGORY,
  DL_AR,
  DL_EN,
  DL_SHORT_AR,
  DRAFT_AR,
  DRAFT_EN,
  OFFICER_AR,
  OFFICER_EN,
  ORG_AR,
  ORG_EN,
  SIGNAL_AR,
  TGD_AR,
  TGD_EN,
  UNIT_AR,
  UNIT_EN,
  benchmarkSentence,
  citationAr,
  extractDatesAr,
  extractFiguresAr,
  extractIdsAr,
  locatorAr,
  trendSentence,
  withLi,
} from "./phrases.ts";

/** The same paragraph in English and Arabic. */
interface Block {
  en: string;
  ar: string;
}

export interface LetterDraft {
  en: LetterContent;
  ar: LetterContent;
  reference: string;
}

interface Ctx {
  input: LetterInput;
  id: SubmissionIdentity;
  rules: RegulationRule[];
  index: Map<string, RegulationRule>;
  today: Date;
  days: number;
  deadline: Date;
}

const CODE: Record<DecisionAction, string> = { request_clarification: "Q", escalate_inspection: "I", refer_penalty: "P", approve: "A" };
const PENALTY_IDS = ["DL11-2024-ART15", "DL11-2024-ART16"];
const PLAN_CATEGORIES = new Set<FindingCategory>(["methane", "data_gap", "emission_factor", "completeness"]);

/** Deterministic reference, e.g. "EAD/MRV/2026/AD-OG-0417/Q1". */
export const letterReference = (id: SubmissionIdentity, action: DecisionAction) => `EAD/MRV/${id.reportingYear + 1}/${id.eadId}/${CODE[action]}1`;

const numbered = (points: Block[]): Block[] => points.map((p, i) => ({ en: `${i + 1}. ${p.en}`, ar: `${i + 1}. ${p.ar}` }));

function cite(c: Ctx, ids: Iterable<string>): Block {
  const known = knownRuleIds(ids, c.rules);
  return { en: known.map((id) => c.index.get(id)!.citation).join("; "), ar: known.map((id) => citationAr(c.index.get(id)!)).join("؛ ") };
}

function evidence(f: Finding): Block {
  const seen = new Set<string>();
  const refs = f.evidence
    .filter((e) => {
      const key = `${e.fileName}|${e.locator}`;
      return seen.has(key) ? false : (seen.add(key), true);
    })
    .slice(0, 3);
  const en = (e: EvidenceRef) => (e.locator && e.locator !== e.fileName ? `${e.fileName} (${e.locator})` : e.fileName);
  const ar = (e: EvidenceRef) => {
    const loc = locatorAr(e);
    return loc ? `${e.fileName} (${loc})` : e.fileName;
  };
  return { en: refs.map(en).join("; "), ar: refs.map(ar).join("؛ ") };
}

/** Identifiers for the Arabic sentence: from the title when it names any, otherwise from the summary. */
function idsAr(f: Finding, c: Ctx): string {
  const exclude = [c.id.eadId, c.id.permit ?? "", c.id.facilityShortName, c.id.facilityName];
  const fromTitle = extractIdsAr(f.title, exclude);
  const ids = fromTitle.length ? fromTitle : extractIdsAr(f.summary, exclude);
  return ids.length ? ` (${ids.join("، ")})` : "";
}

function factsAr(f: Finding): string[] {
  const text = `${f.title}. ${f.summary}`;
  const figures = extractFiguresAr(text);
  const dates = extractDatesAr(text);
  return [figures.length ? `الأرقام الرئيسية: ${figures.join("، ")}.` : "", dates.length ? `التواريخ والفترات ذات الصلة: ${dates.join("، ")}.` : ""].filter(Boolean);
}

/** Arabic "what was found": category sentence with the identifiers, figures and dates of the finding. */
function foundAr(f: Finding, c: Ctx): string {
  const m = c.input.review.metrics;
  const metric = f.category === "benchmark" ? benchmarkSentence(m) : f.category === "trend" ? trendSentence(m) : undefined;
  if (metric) return `${metric.ar}، ${SIGNAL_AR}.`;
  return [`${CATEGORY[f.category].foundAr(idsAr(f, c))}.`, ...factsAr(f)].join(" ");
}

function issuePoint(f: Finding, c: Ctx, opts: { action?: boolean; provisions?: boolean } = {}): Block {
  const en = [ensurePeriod(f.title), ensurePeriod(f.summary)];
  const ar = [foundAr(f, c)];
  if (f.category === "satellite") en.push("Satellite detections are treated as signals to investigate, not as proof.");
  if (f.impact && f.impact.tco2e > 0) {
    en.push(`Estimated impact: about ${fmtT(f.impact.tco2e)} t CO2e.`);
    ar.push(`الأثر التقديري: نحو ${fmtT(f.impact.tco2e)} طن CO2e.`);
  }
  const ev = evidence(f);
  if (ev.en) {
    en.push(`Evidence: ${ev.en}.`);
    ar.push(`المستندات المرجعية: ${ev.ar}.`);
  }
  const rules = opts.provisions ? cite(c, f.ruleIds) : undefined;
  if (rules?.en) {
    en.push(`Relevant provisions: ${rules.en}.`);
    ar.push(`الأحكام ذات الصلة: ${rules.ar}.`);
  }
  if (opts.action) {
    en.push(`Corrective action required: ${CATEGORY[f.category].actionEn}`);
    ar.push(`الإجراء التصحيحي المطلوب: ${CATEGORY[f.category].actionAr}`);
  }
  return { en: en.join(" "), ar: ar.join(" ") };
}

function notePoint(f: Finding, c: Ctx): Block {
  const ev = evidence(f);
  const info = f.severity === "info";
  return {
    en: [ensurePeriod(f.title), ensurePeriod(f.summary), ev.en ? `Evidence: ${ev.en}.` : "", info ? "No action is required." : "Please address this in the next reporting cycle."]
      .filter(Boolean)
      .join(" "),
    ar: [
      `ملاحظة بشأن ${CATEGORY[f.category].topicAr}${idsAr(f, c)}.`,
      ...factsAr(f),
      ev.ar ? `المستندات المرجعية: ${ev.ar}.` : "",
      info ? "ولا تستدعي هذه الملاحظة أي إجراء." : "يُرجى معالجة هذه الملاحظة في دورة الإبلاغ القادمة.",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

function header(c: Ctx, reference: string, subject: Block): Block[] {
  const { id } = c;
  const facilityEn = [`Facility: ${id.facilityName}`, `EAD ID ${id.eadId}`, id.permit ? `permit ${id.permit}` : ""].filter(Boolean).join(", ");
  const facilityAr = [`المنشأة: ${id.facilityName}`, `رقم التسجيل لدى الهيئة: ${id.eadId}`, id.permit ? `رقم التصريح البيئي: ${id.permit}` : ""]
    .filter(Boolean)
    .join("، ");
  return [
    { en: DRAFT_EN, ar: DRAFT_AR },
    { en: `${ORG_EN}\n${UNIT_EN}`, ar: `${ORG_AR}\n${UNIT_AR}` },
    { en: `Our reference: ${reference}\nDate: ${fmtDateEn(c.today)}`, ar: `الرقم المرجعي: ${reference}\nالتاريخ: ${fmtDateAr(c.today)}` },
    {
      en: [`To: ${id.operator}`, id.contactName ? `Attention: ${id.contactName}` : "", facilityEn].filter(Boolean).join("\n"),
      ar: [`السادة/ ${id.operatorAr || id.operator} المحترمين`, id.contactName ? `لعناية: ${id.contactName}` : "", facilityAr].filter(Boolean).join("\n"),
    },
    { en: `Subject: ${subject.en}`, ar: `الموضوع: ${subject.ar}` },
    { en: "Dear Sir or Madam,", ar: "تحية طيبة وبعد،" },
  ];
}

function signature(c: Ctx): Block[] {
  const name = c.input.officerName?.trim();
  return [
    { en: "Yours faithfully,", ar: "وتفضلوا بقبول فائق الاحترام والتقدير،" },
    { en: [name, OFFICER_EN, UNIT_EN, ORG_EN].filter(Boolean).join("\n"), ar: [name, OFFICER_AR, UNIT_AR, ORG_AR].filter(Boolean).join("\n") },
  ];
}

function reviewIntro(c: Ctx): Block {
  const { id } = c;
  const sub = parseIsoDate(id.submittedOn);
  return {
    en: `The Agency has reviewed the annual greenhouse gas emissions report for reporting year ${id.reportingYear} for ${id.facilityName} (EAD ID ${id.eadId}), submitted${sub ? ` on ${fmtDateEn(sub)}` : ""} under Article 6 of ${DL_EN} and ${TGD_EN}.`,
    ar: `راجعت الهيئة تقرير انبعاثات غازات الدفيئة السنوي لسنة الإبلاغ ${id.reportingYear} الخاص بمنشأة ${id.facilityName}، المسجلة لدى الهيئة برقم ${id.eadId}، والمقدَّم${sub ? ` بتاريخ ${fmtDateAr(sub)}` : ""} وفقاً للمادة (6) من ${DL_AR}، و${TGD_AR}.`,
  };
}

function underReporting(c: Ctx): Block | undefined {
  const m = c.input.review.metrics;
  if (!(m.estimatedUnderReportingTco2e > 0)) return undefined;
  const u = fmtT(m.estimatedUnderReportingTco2e);
  const p = fmtPct(m.estimatedUnderReportingPct);
  const t = fmtT(m.reportedTotalTco2e);
  return {
    en: `On the information reviewed, the Agency estimates that about ${u} t CO2e (${p} of the reported ${t} t CO2e) may not have been reported.`,
    ar: `وتقدّر الهيئة، استناداً إلى المعلومات التي تمت مراجعتها، أن نحو ${u} طن CO2e (${p} من إجمالي الانبعاثات المبلغ عنها البالغ ${t} طن CO2e) قد لا تكون مدرجة في التقرير.`,
  };
}

function legalBasis(c: Ctx, ids: string[], includePenalty = false): Block | undefined {
  const basis = cite(
    c,
    knownRuleIds(ids, c.rules).filter((id) => includePenalty || !PENALTY_IDS.includes(id)),
  );
  return basis.en ? { en: `Legal basis: ${basis.en}.`, ar: `السند النظامي: ${basis.ar}.` } : undefined;
}

/** A rule's citation in both languages (Arabic joined for use inside a sentence), or undefined when not in the corpus. */
function ruleRef(c: Ctx, id: string): Block | undefined {
  const rule = c.index.get(id);
  return rule ? { en: rule.citation, ar: citationAr(rule).replace(/؛ /g, "، و") } : undefined;
}

const corrections = (c: Ctx) => ruleRef(c, "EAD-TGD-CORRECTIONS");

/** Art. 15 fines are imposed by the courts; Art. 16 doubles them for the same act repeated within two years of a final conviction. */
function penaltyTerms(c: Ctx): Block {
  const art15 = ruleRef(c, "DL11-2024-ART15") ?? { en: "Article 15 of Federal Decree-Law No. 11 of 2024", ar: `المادة (15) من ${DL_SHORT_AR}` };
  const art16 = ruleRef(c, "DL11-2024-ART16") ?? { en: "Article 16 of the same Decree-Law", ar: `المادة (16) من ${DL_SHORT_AR}` };
  return {
    en: `a breach of Article 6(1) is punishable by a fine of AED 50,000 to AED 2,000,000, imposed by the courts (${art15.en}), and the penalty is doubled if the same act is repeated within two years of a previous final conviction (${art16.en})`,
    ar: `يُعاقب على مخالفة البند (1) من المادة (6) بغرامة لا تقل عن 50,000 درهم ولا تزيد على 2,000,000 درهم تفرضها المحكمة المختصة، وفقاً ${withLi(art15.ar)}، وتُضاعف العقوبة في حال تكرار الفعل ذاته خلال سنتين من تاريخ صدور حكم نهائي سابق بالإدانة، وفقاً ${withLi(art16.ar)}`,
  };
}

function indicators(list: Finding[], c: Ctx): Block | undefined {
  if (!list.length) return undefined;
  const m = c.input.review.metrics;
  const hasTrendFinding = c.input.review.findings.some((f) => f.category === "trend");
  const items: Block[] = list.flatMap((f) => {
    const bench = f.category === "benchmark" ? benchmarkSentence(m) : undefined;
    if (bench) {
      const trend = !hasTrendFinding && /year|prior|trend/i.test(f.summary) ? trendSentence(m) : undefined;
      return trend ? [bench, trend] : [bench];
    }
    const trend = f.category === "trend" ? trendSentence(m) : undefined;
    return [trend ?? { en: stripPeriod(f.summary), ar: stripPeriod(foundAr(f, c)) }];
  });
  return {
    en: `The Agency also notes the following indicators, which do not in themselves establish non-compliance but are consistent with the matters above: ${items.map((i) => stripPeriod(i.en)).join("; ")}.`,
    ar: `كما تلاحظ الهيئة المؤشرات التالية، وهي لا تُثبت بذاتها عدم الامتثال لكنها تتسق مع الملاحظات الواردة أعلاه: ${items.map((i) => stripPeriod(i.ar)).join("؛ ")}.`,
  };
}

const SUBJECT: Record<DecisionAction, (facility: string, year: number) => Block> = {
  request_clarification: (s, y) => ({
    en: `Notice requiring corrective action and clarification: ${s}, reporting year ${y}`,
    ar: `إشعار بطلب إجراءات تصحيحية وإيضاحات: تقرير انبعاثات غازات الدفيئة لسنة الإبلاغ ${y}، منشأة ${s}`,
  }),
  escalate_inspection: (s, y) => ({ en: `Notice of site inspection: ${s}, reporting year ${y}`, ar: `إشعار بزيارة تفتيشية ميدانية: منشأة ${s}، سنة الإبلاغ ${y}` }),
  refer_penalty: (s, y) => ({
    en: `Notice of referral for enforcement action: ${s}, reporting year ${y}`,
    ar: `إشعار بإحالة المخالفات لاتخاذ الإجراءات التنفيذية: منشأة ${s}، سنة الإبلاغ ${y}`,
  }),
  approve: (s, y) => ({ en: `Acceptance of annual emissions report: ${s}, reporting year ${y}`, ar: `قبول تقرير الانبعاثات السنوي: منشأة ${s}، سنة الإبلاغ ${y}` }),
};

// ---------------------------------------------------------------------------
// Letter bodies per action
// ---------------------------------------------------------------------------

type Body = (Block | undefined)[];

function clarificationBody(c: Ctx): Body {
  const { findings, recommendedAction } = c.input.review;
  let listed = [
    ...findings.filter(isActionable).sort(bySeverity),
    ...findings.filter((f) => f.outcome === "signal" && f.category === "satellite" && f.severity !== "info"),
  ];
  if (!listed.length) listed = findings.filter((f) => f.severity !== "info");
  const points = listed.map((f) => issuePoint(f, c, { action: true, provisions: true }));
  if (points.length) {
    const plan = listed.some((f) => PLAN_CATEGORIES.has(f.category));
    const verified = Boolean(c.input.review.facts?.verification) || listed.some((f) => f.category === "verification");
    points.push({
      en: `Submit a corrected emissions report${plan ? " and a revised Monitoring Plan" : ""}, with declarations that reflect the corrected data.${verified ? " As the original report was verified, the Agency recommends that the corrected report is also verified and the updated statement enclosed; third-party verification remains voluntary until 2027." : ""}`,
      ar: `تقديم تقرير انبعاثات مصحح${plan ? " وخطة رصد محدّثة" : ""}، مع إقرارات تعكس البيانات المصححة.${verified ? " ونظراً لخضوع التقرير الأصلي للتحقق، توصي الهيئة بإخضاع التقرير المصحح للتحقق أيضاً وإرفاق بيان التحقق المحدّث، علماً بأن التحقق من قبل جهة خارجية يظل طوعياً حتى عام 2027." : ""}`,
    });
  }
  const under = underReporting(c);
  const corr = corrections(c);
  const basis = ruleRef(c, "EAD-TGD-INSPECTION");
  const penalty = penaltyTerms(c);
  return [
    reviewIntro(c),
    {
      en: `The Agency issues this written notice${basis ? ` under its powers to verify the accuracy of reported data (${basis.en})` : ""}. It sets out each matter identified in the review, the corrective action required and the deadline for your response.`,
      ar: `وتصدر الهيئة هذا الإشعار الكتابي${basis ? ` استناداً إلى صلاحياتها في التحقق من دقة البيانات المبلغ عنها، وفقاً ${withLi(basis.ar)}` : ""}، ويبين الإشعار كل ملاحظة أسفرت عنها المراجعة، والإجراء التصحيحي المطلوب، والمهلة المحددة للرد.`,
    },
    points.length
      ? {
          en: `The review identified the matters set out below. Each states what was found, the evidence and the corrective action required.${under ? ` ${under.en}` : ""}`,
          ar: `وقد أسفرت المراجعة عن الملاحظات المبينة أدناه، ويتضمن كل منها ما تم رصده والمستندات المرجعية والإجراء التصحيحي المطلوب.${under ? ` ${under.ar}` : ""}`,
        }
      : {
          en: "The Agency requests your clarification on the report, together with any supporting evidence you consider relevant.",
          ar: "وتطلب الهيئة تزويدها بإيضاحاتكم بشأن التقرير، مع أي أدلة داعمة ترونها ذات صلة.",
        },
    ...numbered(points),
    indicators(
      findings.filter((f) => f.outcome === "signal" && f.severity !== "info" && !listed.includes(f)),
      c,
    ),
    {
      en: `Please submit your response, the corrective actions taken and the supporting evidence through the EAD Facility MRV portal within ${c.days} days of the date of this letter, that is by ${fmtDateEn(c.deadline)}.${corr ? ` Errors identified in a report are to be corrected within 30 days of discovery (${corr.en}).` : ""}`,
      ar: `يُرجى تقديم ردكم والإجراءات التصحيحية المتخذة مشفوعة بالأدلة الداعمة عبر بوابة الهيئة للرصد والإبلاغ والتحقق للمنشآت خلال ${daysAr(c.days)} من تاريخ هذا الخطاب، أي في موعد أقصاه ${fmtDateAr(c.deadline)}.${corr ? ` علماً بأن الأخطاء التي تُكتشف في التقرير يتعين تصحيحها خلال 30 يوماً من تاريخ اكتشافها، وفقاً ${withLi(corr.ar)}.` : ""}`,
    },
    legalBasis(c, [...listed.flatMap((f) => f.ruleIds), ...recommendedAction.ruleIds]),
    {
      en: `If these matters are not remedied, the company may be exposed to the penalties set by Federal Decree-Law No. 11 of 2024: ${penalty.en}. The Agency may also take further action under applicable legislation.`,
      ar: `وفي حال عدم معالجة هذه الملاحظات، قد تتعرض الشركة للعقوبات المقررة في ${DL_SHORT_AR}، إذ ${penalty.ar}. كما يجوز للهيئة اتخاذ ما تراه من إجراءات أخرى وفقاً للتشريعات السارية.`,
    },
    {
      en: "No final decision has been taken. The Agency will consider your response before deciding on any further action.",
      ar: "ولم تتخذ الهيئة أي قرار نهائي بعد، وستنظر في ردكم قبل تحديد أي إجراء لاحق.",
    },
  ];
}

function inspectionBody(c: Ctx): Body {
  const { findings, recommendedAction } = c.input.review;
  const satellite = findings.filter((f) => f.category === "satellite" && f.severity !== "info");
  let reasons = [...satellite, ...findings.filter((f) => isActionable(f) && f.category !== "satellite").sort(bySeverity)];
  if (!reasons.length) reasons = findings.filter((f) => f.severity !== "info");
  const cats = new Set(reasons.map((f) => f.category));
  const has = (...list: FindingCategory[]) => list.some((x) => cats.has(x));
  const prepare: Block[] = [
    {
      en: "Access to the facility, to the emission measurement records (which must be kept for five years) and to the staff responsible for greenhouse gas monitoring, metering, laboratory sampling and production accounting.",
      ar: "إتاحة الوصول إلى المنشأة وإلى سجلات قياس الانبعاثات (التي يتعين الاحتفاظ بها لمدة خمس سنوات) وإلى الموظفين المسؤولين عن رصد غازات الدفيئة والقياس وأخذ العينات المخبرية والمحاسبة الإنتاجية.",
    },
  ];
  if (has("data_gap", "evidence", "calculation"))
    prepare.push({
      en: "Calibration, maintenance and raw data records (for example historian exports) for the meters referred to above, covering the whole reporting year.",
      ar: "سجلات المعايرة والصيانة والبيانات الأولية (مثل مستخرجات نظام أرشفة البيانات) للعدادات المشار إليها أعلاه، عن كامل سنة الإبلاغ.",
    });
  if (has("evidence")) prepare.push({ en: "The monthly production allocation and gas balance reports.", ar: "تقارير توزيع الإنتاج والموازنة الغازية الشهرية." });
  if (has("satellite"))
    prepare.push({
      en: "Operating logs, alarm records and permits to work for the dates of the satellite signals, and records of venting, blowdown and flaring events.",
      ar: "السجلات التشغيلية وسجلات الإنذارات وتصاريح العمل في تواريخ إشارات الرصد بالأقمار الاصطناعية، وسجلات عمليات التنفيس وتفريغ الضغط والحرق.",
    });
  if (has("methane"))
    prepare.push({
      en: "An inventory of methane sources, including storage tanks, process vents, pneumatic devices, compressor seals and fugitive components, with any leak detection surveys.",
      ar: "قائمة حصر مصادر الميثان، بما فيها خزانات التخزين وفتحات التنفيس والأجهزة الهوائية وموانع تسرب الضواغط ومكونات الانبعاثات المتسربة، مع أي مسوحات لكشف التسربات.",
    });
  if (has("emission_factor")) prepare.push({ en: "Laboratory gas analysis reports and sampling records.", ar: "تقارير التحاليل المخبرية للغاز وسجلات أخذ العينات." });
  if (has("verification", "declaration")) prepare.push({ en: "The full verification report and the verifier's findings log.", ar: "تقرير التحقق الكامل وسجل ملاحظات جهة التحقق." });
  prepare.push({ en: "The Monitoring Plan in force and any revisions.", ar: "خطة الرصد السارية وأي تعديلات عليها." });

  const inspection = ruleRef(c, "EAD-TGD-INSPECTION");
  return [
    reviewIntro(c),
    {
      en: `Based on this review, the Agency intends to carry out a site inspection of the facility to verify the reported emissions, the underlying records and the monitoring arrangements${inspection ? ` (${inspection.en})` : ""}.${reasons.length ? " The inspection is prompted by the matters set out below." : ""}${satellite.length ? " Satellite detections are treated as signals that require explanation, not as proof of a breach." : ""}`,
      ar: `وبناءً على نتائج هذه المراجعة، تعتزم الهيئة إجراء زيارة تفتيشية ميدانية للمنشأة للتحقق من الانبعاثات المبلغ عنها والسجلات المؤيدة لها وترتيبات الرصد المعتمدة${inspection ? `، وذلك استناداً إلى ${inspection.ar}` : ""}.${reasons.length ? " وتستند هذه الزيارة إلى الأمور المبينة أدناه." : ""}${satellite.length ? " علماً بأن إشارات الرصد بالأقمار الاصطناعية تُعامل بوصفها مؤشرات تستدعي الإيضاح، لا دليلاً على وقوع مخالفة." : ""}`,
    },
    ...numbered(reasons.map((f) => issuePoint(f, c))),
    { en: "Please make the following available to the inspection team:", ar: "يُرجى إتاحة ما يلي لفريق التفتيش:" },
    ...numbered(prepare),
    {
      en: "The Agency will contact you to confirm the date and scope of the inspection. Please nominate a point of contact for the inspection in your reply to this letter.",
      ar: "وستتواصل الهيئة معكم لتأكيد موعد الزيارة ونطاقها، ويُرجى تسمية منسق للزيارة التفتيشية في ردكم على هذا الخطاب.",
    },
    legalBasis(c, [...reasons.flatMap((f) => f.ruleIds), ...recommendedAction.ruleIds]),
    {
      en: "This notice does not constitute a finding of non-compliance. The Agency will take the results of the inspection and any information you provide into account before deciding on any further action.",
      ar: "ولا يُعد هذا الإشعار قراراً بعدم الامتثال، وستأخذ الهيئة نتائج الزيارة وأي معلومات تقدمونها بعين الاعتبار قبل تحديد أي إجراء لاحق.",
    },
  ];
}

function penaltyBody(c: Ctx): Body {
  const { findings, recommendedAction, legalExposure } = c.input.review;
  let listed = findings.filter((f) => f.outcome === "breach" && f.severity !== "info").sort(bySeverity);
  if (!listed.length) listed = findings.filter(isActionable).sort(bySeverity);
  return [
    reviewIntro(c),
    listed.length
      ? {
          en: `The review identified the following breaches of the reporting obligations under ${DL_EN} and ${TGD_EN}:`,
          ar: `وقد أسفرت المراجعة عن رصد المخالفات التالية لالتزامات الإبلاغ المقررة بموجب ${DL_AR}، و${TGD_AR}:`,
        }
      : { en: "The Agency has concluded its review of the report.", ar: "وقد أنهت الهيئة مراجعة التقرير." },
    ...numbered(listed.map((f) => issuePoint(f, c, { provisions: true }))),
    underReporting(c),
    {
      en: `Accordingly, the Agency intends to refer these breaches for enforcement action under applicable legislation. Under Federal Decree-Law No. 11 of 2024, ${penaltyTerms(c).en}.`,
      ar: `وبناءً على ذلك، تعتزم الهيئة إحالة هذه المخالفات لاتخاذ الإجراءات التنفيذية وفقاً للتشريعات السارية. وبموجب ${DL_SHORT_AR}، ${penaltyTerms(c).ar}.`,
    },
    {
      en: `This notice does not relieve the company of its obligation to correct the report. You may submit written representations and supporting evidence within ${c.days} days of the date of this letter, that is by ${fmtDateEn(c.deadline)}, and the Agency will consider them before the referral is made.`,
      ar: `ولا يُعفي هذا الإشعار الشركة من التزامها بتصحيح التقرير، ويحق لكم تقديم ملاحظاتكم المكتوبة مشفوعة بالأدلة الداعمة خلال ${daysAr(c.days)} من تاريخ هذا الخطاب، أي في موعد أقصاه ${fmtDateAr(c.deadline)}، وستنظر الهيئة فيها قبل إتمام الإحالة.`,
    },
    legalBasis(c, [...listed.flatMap((f) => f.ruleIds), ...recommendedAction.ruleIds, ...(legalExposure?.ruleIds ?? []), ...PENALTY_IDS], true),
  ];
}

function approvalBody(c: Ctx): Body {
  const { findings, metrics: m } = c.input.review;
  const y = c.id.reportingYear;
  const inRange =
    m.intensityKgCo2ePerBoe != null &&
    m.peerMinIntensity != null &&
    m.peerMaxIntensity != null &&
    m.intensityKgCo2ePerBoe >= m.peerMinIntensity &&
    m.intensityKgCo2ePerBoe <= m.peerMaxIntensity;
  const i = inRange ? fmtIntensity(m.intensityKgCo2ePerBoe!) : "";
  const min = inRange ? fmtIntensity(m.peerMinIntensity!) : "";
  const max = inRange ? fmtIntensity(m.peerMaxIntensity!) : "";
  const corr = corrections(c);
  const notes = [...findings].sort(bySeverity);
  return [
    reviewIntro(c),
    {
      en: `The Agency is pleased to confirm that the report is accepted. The reported emissions of ${fmtT(m.reportedTotalTco2e)} t CO2e (${fmtT(m.co2T)} t CO2 and ${fmtNum(m.ch4T, 1)} t CH4) have been recorded for reporting year ${y}.${inRange ? ` The reported intensity of ${i} kg CO2e/boe is within the range of comparable facilities (${min} to ${max} kg CO2e/boe).` : ""}`,
      ar: `ويسر الهيئة إفادتكم بقبول التقرير، وقد تم تسجيل الانبعاثات المبلغ عنها لسنة الإبلاغ ${y} والبالغة ${fmtT(m.reportedTotalTco2e)} طن CO2e (${fmtT(m.co2T)} طن CO2 و${fmtNum(m.ch4T, 1)} طن CH4).${inRange ? ` وتقع كثافة الانبعاثات المبلغ عنها البالغة ${i} كغ CO2e لكل برميل مكافئ ضمن نطاق المنشآت المماثلة (من ${min} إلى ${max} كغ CO2e لكل برميل مكافئ).` : ""}`,
    },
    notes.length
      ? { en: "The Agency notes the following observations, which do not affect this acceptance:", ar: "وتود الهيئة الإشارة إلى الملاحظات التالية، والتي لا تؤثر على قبول التقرير:" }
      : { en: "The review did not identify any matters requiring action.", ar: "ولم تُسفر المراجعة عن أي ملاحظات تستدعي اتخاذ إجراء." },
    ...numbered(notes.map((f) => notePoint(f, c))),
    {
      en: `This acceptance is based on the information submitted. It does not prevent the Agency from requesting further information or carrying out an inspection${corr ? `, and any errors found later must be corrected within 30 days of discovery (${corr.en})` : ""}.`,
      ar: `ويستند هذا القبول إلى المعلومات المقدمة، ولا يحول دون طلب الهيئة معلومات إضافية أو إجراء زيارة تفتيشية${corr ? `، كما يتعين تصحيح أي أخطاء تُكتشف لاحقاً خلال 30 يوماً من تاريخ اكتشافها، وفقاً ${withLi(corr.ar)}` : ""}.`,
    },
    { en: "Thank you for your cooperation.", ar: "شاكرين لكم حسن تعاونكم." },
  ];
}

const BODY: Record<DecisionAction, (c: Ctx) => Body> = {
  request_clarification: clarificationBody,
  escalate_inspection: inspectionBody,
  refer_penalty: penaltyBody,
  approve: approvalBody,
};

export function letterTemplate(input: LetterInput, today = gstToday()): LetterDraft {
  const days = input.review.recommendedAction.responseDays ?? 30;
  const c: Ctx = { input, id: input.identity, rules: input.rules, index: ruleIndex(input.rules), today, days, deadline: addDays(today, days) };
  const reference = letterReference(input.identity, input.action);
  const subject = SUBJECT[input.action](`${c.id.facilityShortName || c.id.facilityName} (${c.id.eadId})`, c.id.reportingYear);
  const blocks = [...header(c, reference, subject), ...BODY[input.action](c), ...signature(c)].filter((b): b is Block => Boolean(b?.en));
  return {
    en: { subject: subject.en, body: blocks.map((b) => b.en).join("\n\n") },
    ar: { subject: subject.ar, body: blocks.map((b) => b.ar).join("\n\n") },
    reference,
  };
}

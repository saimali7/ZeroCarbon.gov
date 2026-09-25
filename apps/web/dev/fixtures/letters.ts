import type { DecisionAction, LetterContent, Review } from "@zerocarbon/shared";
import type { FacilityFixture, LetterItem } from "./types";

const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

const parts = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { y, m: m - 1, d };
};
const dateEn = (iso: string) => {
  const { y, m, d } = parts(iso);
  return `${d} ${MONTHS_EN[m]} ${y}`;
};
const dateAr = (iso: string) => {
  const { y, m, d } = parts(iso);
  return `${d} ${MONTHS_AR[m]} ${y}`;
};
const num = (n: number) => n.toLocaleString("en-US");
const list = (items: string[]) => items.map((t, i) => `${i + 1}. ${t}`).join("\n");

const SIGN_EN = "Yours faithfully,\n\nFacility-Level MRV Team\nEnvironment Agency - Abu Dhabi";
const SIGN_AR = "وتفضلوا بقبول فائق الاحترام والتقدير،\n\nفريق القياس والإبلاغ والتحقق على مستوى المنشآت\nهيئة البيئة - أبوظبي";

const PENALTY_EN =
  "Under Articles 15 and 16 of Federal Decree-Law No. 11 of 2024, a breach of Article 6(1) is punishable by a fine of AED 50,000 to AED 2,000,000, doubled for a repeat violation within two years.";
const PENALTY_AR =
  "ووفقاً للمادتين (15) و(16) من المرسوم بقانون اتحادي رقم (11) لسنة 2024، يعاقب على مخالفة البند (1) من المادة (6) بغرامة لا تقل عن 50,000 درهم ولا تزيد على 2,000,000 درهم، وتضاعف الغرامة في حال تكرار المخالفة خلال سنتين.";

export interface LetterContext {
  fixture: FacilityFixture;
  review: Review;
  action: DecisionAction;
  reference: string;
  /** ISO date of the letter. */
  date: string;
}

/** Bilingual regulator letter for a decision, with numbered items drawn from the review findings. */
export function buildLetter({ fixture: f, review, action, reference, date }: LetterContext): { en: LetterContent; ar: LetterContent } {
  const r = f.report;
  const m = review.metrics;
  const submitted = r.submittedOn ?? date;
  const titled = (ids: string[]): LetterItem[] =>
    review.findings.filter((x) => ids.includes(x.id)).map((x) => ({ en: `${x.title}.`, ar: `${f.letter.findingTitlesAr[x.id] ?? x.title}.` }));
  const breaches = titled(review.findings.filter((x) => x.outcome === "breach").map((x) => x.id));
  const allFindings = titled(review.findings.map((x) => x.id));

  const headEn = `Our ref: ${reference}\nDate: ${dateEn(date)}\n\nTo: ${f.manager.en}, Facility Manager\n${r.operator.name}\nFacility: ${r.facility.name}, EAD ID ${r.facility.eadId}, permit ${r.facility.permit}\n\nDear ${f.manager.en},`;
  const headAr = `المرجع: ${reference}\nالتاريخ: ${dateAr(date)}\n\nالسيد/ ${f.manager.ar}، مدير المنشأة\n${r.operator.nameAr ?? r.operator.name}\nالمنشأة: ${f.facilityNameAr}، رقم التسجيل لدى الهيئة ${r.facility.eadId}، التصريح ${r.facility.permit}\n\nتحية طيبة وبعد،`;
  const introEn = `The Environment Agency - Abu Dhabi has reviewed the annual greenhouse gas emissions report for ${r.facility.name}, reporting year ${r.reportingYear}, submitted on ${dateEn(submitted)} under Article 6(1) of Federal Decree-Law No. 11 of 2024 and the Agency's Technical Guidance for MRV.`;
  const introAr = `أجرت هيئة البيئة - أبوظبي مراجعة لتقرير انبعاثات غازات الدفيئة السنوي العائد إلى ${f.facilityNameAr} عن سنة الإبلاغ ${r.reportingYear}، المقدم بتاريخ ${dateAr(submitted)} وفقاً للبند (1) من المادة (6) من المرسوم بقانون اتحادي رقم (11) لسنة 2024 بشأن الحد من آثار التغير المناخي والدليل الفني للهيئة بشأن القياس والإبلاغ والتحقق.`;
  const underEn = m.estimatedUnderReportingTco2e > 0
    ? ` The Agency estimates that emissions may be under-reported by about ${num(m.estimatedUnderReportingTco2e)} t CO2e (${m.estimatedUnderReportingPct}% of the reported total of ${num(m.reportedTotalTco2e)} t CO2e).`
    : "";
  const underAr = m.estimatedUnderReportingTco2e > 0
    ? ` وتقدر الهيئة أن الانبعاثات المبلغ عنها قد تقل عن الفعلية بنحو ${num(m.estimatedUnderReportingTco2e)} طن من مكافئ ثاني أكسيد الكربون (${m.estimatedUnderReportingPct}% من الإجمالي المبلغ عنه البالغ ${num(m.reportedTotalTco2e)} طن).`
    : "";
  const short = `${f.shortName} (${r.facility.eadId})`;
  const shortAr = `${f.shortNameAr} (${r.facility.eadId})`;
  const year = r.reportingYear;
  const join = (...blocks: string[]) => blocks.filter(Boolean).join("\n\n");

  switch (action) {
    case "approve": {
      const clean = review.status === "compliant";
      const notes = allFindings;
      return {
        en: {
          subject: `Acceptance of the Annual GHG Emissions Report RY${year}: ${short}`,
          body: join(
            headEn,
            `${introEn} The Agency accepts the report as submitted, with reported emissions of ${num(r.totals.totalCo2eT)} t CO2e (${num(r.totals.co2T)} t CO2 and ${r.totals.ch4T} t CH4).`,
            notes.length ? (clean ? "The review noted the following, which require no further action:" : "The review noted the following matters, which the Agency expects to be addressed in the next annual report:") : "",
            notes.length ? list(notes.map((x) => x.en)) : "",
            "Please retain all monitoring records, calculations and supporting evidence for at least five years, as required by Article 6(1), and continue to apply the approved Monitoring Plan in the next reporting year.",
            SIGN_EN,
          ),
        },
        ar: {
          subject: `قبول تقرير انبعاثات غازات الدفيئة السنوي لسنة الإبلاغ ${year}: ${shortAr}`,
          body: join(
            headAr,
            `${introAr} وتفيدكم الهيئة بقبول التقرير كما قدم، بإجمالي انبعاثات مبلغ عنها قدره ${num(r.totals.totalCo2eT)} طن من مكافئ ثاني أكسيد الكربون (${num(r.totals.co2T)} طن من ثاني أكسيد الكربون و${r.totals.ch4T} طن من الميثان).`,
            notes.length ? (clean ? "وقد سجلت المراجعة الملاحظات التالية، ولا تتطلب أي إجراء إضافي:" : "وقد سجلت المراجعة الملاحظات التالية، وتتوقع الهيئة معالجتها في التقرير السنوي القادم:") : "",
            notes.length ? list(notes.map((x) => x.ar)) : "",
            "يرجى الاحتفاظ بجميع سجلات الرصد والحسابات والأدلة الداعمة مدة لا تقل عن خمس سنوات وفقاً للبند (1) من المادة (6)، والاستمرار في تطبيق خطة الرصد المعتمدة في سنة الإبلاغ القادمة.",
            SIGN_AR,
          ),
        },
      };
    }
    case "request_clarification": {
      const items = f.letter.requests;
      return {
        en: {
          subject: `Request for clarification and corrected report: Annual GHG Emissions Report RY${year}, ${short}`,
          body: join(
            headEn,
            `${introEn} The review identified matters that affect the completeness and accuracy of the report.${underEn}`,
            "You are requested to:",
            list(items.map((x) => x.en)),
            `Please submit the corrected emissions report, together with a revised Monitoring Plan and an updated verification statement where applicable, through the EAD Facility MRV portal within ${review.recommendedAction.responseDays ?? 30} days of the date of this letter, in line with Step 5 of the Technical Guidance (corrections within 30 days).`,
            `If these matters are not remedied, the Agency may take further action. ${PENALTY_EN}`,
            "For any questions, please contact the Facility-Level MRV Team through the portal, quoting the reference above.",
            SIGN_EN,
          ),
        },
        ar: {
          subject: `طلب إيضاحات وتقرير مصحح: تقرير انبعاثات غازات الدفيئة السنوي لسنة الإبلاغ ${year}، ${shortAr}`,
          body: join(
            headAr,
            `${introAr} وقد تبين من المراجعة وجود ملاحظات تؤثر على اكتمال التقرير ودقته.${underAr}`,
            "وعليه، يرجى القيام بما يلي:",
            list(items.map((x) => x.ar)),
            `يرجى تقديم تقرير الانبعاثات المصحح، مرفقاً بخطة الرصد المعدلة وبيان تحقق محدث حسب الاقتضاء، عبر بوابة الهيئة للقياس والإبلاغ والتحقق على مستوى المنشآت خلال ${review.recommendedAction.responseDays ?? 30} يوماً من تاريخ هذا الخطاب، وذلك وفقاً للخطوة 5 من الدليل الفني (تصحيح الأخطاء خلال 30 يوماً).`,
            `وفي حال عدم معالجة هذه الملاحظات، يحق للهيئة اتخاذ المزيد من الإجراءات. ${PENALTY_AR}`,
            "للاستفسار، يرجى التواصل مع فريق القياس والإبلاغ والتحقق على مستوى المنشآت عبر البوابة مع ذكر المرجع أعلاه.",
            SIGN_AR,
          ),
        },
      };
    }
    case "escalate_inspection": {
      const items = f.letter.inspection;
      return {
        en: {
          subject: `Notice of site inspection: Annual GHG Emissions Report RY${year}, ${short}`,
          body: join(
            headEn,
            `${introEn} The review identified matters that need to be verified on site.${underEn} In accordance with Step 6 of the Technical Guidance, the Agency will carry out an inspection of the facility. An inspector will contact you to agree a date within the next 14 days.`,
            "During the inspection the Agency will examine:",
            list(items.map((x) => x.en)),
            "Please make the relevant monitoring records, meter and alarm logs, calibration and permit-to-work records available, together with the staff responsible for the Monitoring Plan.",
            `This inspection does not replace the obligation to correct any errors in the report within 30 days of discovery (Step 5). ${PENALTY_EN}`,
            SIGN_EN,
          ),
        },
        ar: {
          subject: `إشعار بزيارة تفتيشية: تقرير انبعاثات غازات الدفيئة السنوي لسنة الإبلاغ ${year}، ${shortAr}`,
          body: join(
            headAr,
            `${introAr} وقد تبين من المراجعة وجود ملاحظات تستوجب التحقق منها ميدانياً.${underAr} ووفقاً للخطوة 6 من الدليل الفني، ستقوم الهيئة بزيارة تفتيشية للمنشأة، وسيتواصل معكم أحد المفتشين لتحديد موعد خلال الأيام الأربعة عشر القادمة.`,
            "وستشمل الزيارة التفتيشية ما يلي:",
            list(items.map((x) => x.ar)),
            "يرجى إتاحة سجلات الرصد وسجلات العدادات والإنذارات وسجلات المعايرة وتصاريح العمل ذات الصلة، وحضور الموظفين المسؤولين عن خطة الرصد.",
            `ولا تغني هذه الزيارة عن الالتزام بتصحيح أي أخطاء في التقرير خلال 30 يوماً من اكتشافها (الخطوة 5). ${PENALTY_AR}`,
            SIGN_AR,
          ),
        },
      };
    }
    case "refer_penalty": {
      const items = breaches.length ? breaches : allFindings;
      return {
        en: {
          subject: `Notice of referral for enforcement: Annual GHG Emissions Report RY${year}, ${short}`,
          body: join(
            headEn,
            `${introEn}${underEn} The review found the following breaches of Article 6(1) of Federal Decree-Law No. 11 of 2024 and the Agency's Technical Guidance:`,
            list(items.map((x) => x.en)),
            `The matter has been referred for enforcement action. ${PENALTY_EN}`,
            "You may submit written representations to the Agency within 14 days of the date of this letter. This referral does not remove the obligation to submit a corrected report within 30 days (Technical Guidance, Step 5).",
            SIGN_EN,
          ),
        },
        ar: {
          subject: `إشعار بالإحالة لاتخاذ إجراءات الإنفاذ: تقرير انبعاثات غازات الدفيئة السنوي لسنة الإبلاغ ${year}، ${shortAr}`,
          body: join(
            headAr,
            `${introAr}${underAr} وقد تبين من المراجعة وجود المخالفات التالية للبند (1) من المادة (6) من المرسوم بقانون اتحادي رقم (11) لسنة 2024 وللدليل الفني للهيئة:`,
            list(items.map((x) => x.ar)),
            `وقد أحيل الموضوع لاتخاذ إجراءات الإنفاذ اللازمة. ${PENALTY_AR}`,
            "ويحق لكم تقديم ملاحظاتكم المكتوبة إلى الهيئة خلال 14 يوماً من تاريخ هذا الخطاب، ولا تعفي هذه الإحالة من الالتزام بتقديم تقرير مصحح خلال 30 يوماً (الدليل الفني، الخطوة 5).",
            SIGN_AR,
          ),
        },
      };
    }
  }
}

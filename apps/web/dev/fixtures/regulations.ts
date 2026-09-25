import type { RegulationRule, RuleId } from "@zerocarbon/shared";

const DL = {
  instrument: "Federal Decree-Law No. 11 of 2024 on the Reduction of Climate Change Effects",
  jurisdiction: "UAE federal",
  sourceUrl: "https://uaelegislation.gov.ae/en/legislations/2558",
  sourceTitle: "UAE Legislation: Federal Decree-Law No. 11 of 2024",
} as const;

const TGD = {
  instrument: "EAD Technical Guidance for MRV of Greenhouse Gas Emissions in Abu Dhabi Emirate",
  jurisdiction: "Abu Dhabi",
  sourceUrl: "https://facilitymrv.ead.ae/appDocuments/20250303%20-%20Technical%20Guidance%20v5%20-%20No%20Cover.pdf",
  sourceTitle: "EAD Technical Guidance for MRV, version 5 (March 2025)",
} as const;

const WORKSHOP = {
  instrument: "EAD Facility-Level MRV Programme",
  jurisdiction: "Abu Dhabi",
  sourceUrl: "https://facilitymrv.ead.ae/appDocuments/20260312_EAD%20MRV_%20Workshop%20Presentation.pdf",
  sourceTitle: "EAD Facility-Level MRV Workshop, 12 March 2026",
} as const;

type Rule = RegulationRule & { id: RuleId };

/** The regulations corpus. Every finding, letter and answer may only cite ids from this list. */
export const REGULATIONS = [
  {
    id: "DL11-2024-ART6-1",
    citation: "Decree-Law 11/2024, Art. 6(1)",
    title: "Measure, inventory and report emissions",
    titleAr: "قياس الانبعاثات وحصرها والإبلاغ عنها",
    summary:
      "Designated businesses must measure their greenhouse gas emissions, keep an emissions inventory, report periodically together with plans to reduce emissions, and keep the records for at least 5 years.",
    summaryAr:
      "يلتزم أصحاب الأنشطة المحددة بقياس انبعاثاتهم من غازات الدفيئة، والاحتفاظ بسجل لحصرها، ورفع تقارير دورية مشفوعة بخطط لخفض الانبعاثات، والاحتفاظ بالسجلات مدة لا تقل عن خمس سنوات.",
    ...DL,
    confidence: "verified",
    tags: ["reporting", "inventory", "records", "core obligation"],
  },
  {
    id: "DL11-2024-ART15",
    citation: "Decree-Law 11/2024, Art. 15",
    title: "Fines for breaching the reporting obligation",
    titleAr: "الغرامات على مخالفة التزامات القياس والإبلاغ",
    summary: "A breach of Article 6(1) is punishable by a fine of not less than AED 50,000 and not more than AED 2,000,000.",
    summaryAr: "يعاقب على مخالفة أحكام البند (1) من المادة (6) بغرامة لا تقل عن 50,000 درهم ولا تزيد على 2,000,000 درهم.",
    ...DL,
    confidence: "verified",
    tags: ["penalty", "fine", "enforcement"],
  },
  {
    id: "DL11-2024-ART16",
    citation: "Decree-Law 11/2024, Art. 16",
    title: "Doubled fines for repeat violations",
    titleAr: "مضاعفة الغرامة عند تكرار المخالفة",
    summary: "The fine is doubled if the same violation is repeated within 2 years of the previous one.",
    summaryAr: "تضاعف الغرامة في حال تكرار المخالفة ذاتها خلال سنتين من تاريخ ارتكاب المخالفة السابقة.",
    ...DL,
    confidence: "verified",
    tags: ["penalty", "repeat violation", "enforcement"],
  },
  {
    id: "DL11-2024-ART17",
    citation: "Decree-Law 11/2024, Art. 17",
    title: "Administrative penalties",
    titleAr: "الجزاءات الإدارية",
    summary:
      "A Cabinet resolution will set the administrative penalties for violations of the Decree-Law and its implementing regulations. The regime has not yet been published, so only the fines in Articles 15 and 16 can be cited today.",
    summaryAr:
      "يصدر مجلس الوزراء قراراً بتحديد الجزاءات الإدارية على مخالفة أحكام المرسوم بقانون ولائحته التنفيذية، ولم يصدر هذا القرار بعد، لذا يقتصر الاستناد حالياً على الغرامات الواردة في المادتين (15) و(16).",
    ...DL,
    confidence: "secondary",
    tags: ["penalty", "administrative", "pending regulation"],
  },
  {
    id: "DL11-2024-ART18",
    citation: "Decree-Law 11/2024, Art. 18",
    title: "One-year compliance period",
    titleAr: "مهلة توفيق الأوضاع",
    summary:
      "Businesses subject to the Decree-Law must comply within one year of its entry into force. It entered into force on 30 May 2025, so the period ends on 30 May 2026.",
    summaryAr:
      "يتعين على الجهات الخاضعة لأحكام المرسوم بقانون توفيق أوضاعها خلال سنة واحدة من تاريخ العمل به، وقد دخل حيز التنفيذ في 30 مايو 2025، وتنتهي المهلة في 30 مايو 2026.",
    ...DL,
    confidence: "verified",
    tags: ["transition", "deadline"],
  },
  {
    id: "CR67-2024-REGISTRY",
    citation: "Cabinet Resolution 67/2024",
    title: "National Register for Carbon Credits",
    titleAr: "السجل الوطني لأرصدة الكربون",
    summary:
      "Entities emitting 0.5 million t CO2e or more a year (Scope 1 and 2) must register in the National Register for Carbon Credits, operate an MRV system and report their emissions annually to the Ministry of Climate Change and Environment. Abu Dhabi facilities report through EAD.",
    summaryAr:
      "تلتزم الجهات التي تبلغ انبعاثاتها السنوية 0.5 مليون طن من مكافئ ثاني أكسيد الكربون أو أكثر (النطاقان 1 و2) بالتسجيل في السجل الوطني لأرصدة الكربون، وتطبيق نظام للقياس والإبلاغ والتحقق، والإبلاغ السنوي عن انبعاثاتها إلى وزارة التغير المناخي والبيئة.",
    instrument: "Cabinet Resolution No. 67 of 2024 Concerning the National Register for Carbon Credits",
    jurisdiction: "UAE federal",
    sourceUrl: "https://uaelegislation.gov.ae/en/legislations/2521",
    sourceTitle: "UAE Legislation: Cabinet Resolution No. 67 of 2024",
    confidence: "secondary",
    tags: ["registry", "carbon credits", "threshold"],
  },
  {
    id: "EAD-MRV-SCOPE",
    citation: "EAD MRV Workshop 2026, Scope",
    title: "Who must report, and what",
    titleAr: "نطاق الإبلاغ والحد الأدنى للانبعاثات",
    summary:
      "Facilities in the power, oil and gas and industry sectors emitting 25,000 t CO2e or more a year must register with EAD and report their direct (Scope 1) CO2 and CH4 emissions.",
    summaryAr:
      "يتعين على المنشآت في قطاعات الطاقة والنفط والغاز والصناعة التي تبلغ انبعاثاتها 25,000 طن من مكافئ ثاني أكسيد الكربون سنوياً أو أكثر التسجيل لدى الهيئة والإبلاغ عن انبعاثاتها المباشرة (النطاق 1) من ثاني أكسيد الكربون والميثان.",
    ...WORKSHOP,
    confidence: "verified",
    tags: ["scope", "threshold", "CO2", "CH4"],
  },
  {
    id: "EAD-MRV-DEADLINE",
    citation: "EAD MRV Workshop 2026, Deadline",
    title: "Annual report deadline",
    titleAr: "الموعد النهائي لتقديم التقرير السنوي",
    summary: "The annual emissions report for the previous calendar year is due by 31 March, with a grace period to 14 April.",
    summaryAr: "يقدم تقرير الانبعاثات السنوي عن السنة الميلادية السابقة في موعد أقصاه 31 مارس، مع فترة سماح حتى 14 أبريل.",
    ...WORKSHOP,
    confidence: "verified",
    tags: ["deadline", "submission"],
  },
  {
    id: "EAD-TGD-MP-UPDATE",
    citation: "EAD TGD, Step 2 (Monitoring Plan)",
    title: "Keep the Monitoring Plan up to date",
    titleAr: "تحديث خطة الرصد",
    summary:
      "The Monitoring Plan must be updated every year and revised and resubmitted within 30 days of any significant change in operations, methodology or measurement equipment.",
    summaryAr:
      "يجب تحديث خطة الرصد سنوياً، ومراجعتها وإعادة تقديمها خلال 30 يوماً من أي تغيير جوهري في العمليات أو المنهجية أو معدات القياس.",
    ...TGD,
    confidence: "verified",
    tags: ["monitoring plan", "30 days", "change management"],
  },
  {
    id: "EAD-TGD-COMPLETENESS",
    citation: "EAD TGD, Step 3 (completeness)",
    title: "Report all emissions",
    titleAr: "اكتمال الإبلاغ",
    summary:
      "Monitoring and reporting must cover all emission sources and source streams, avoid double counting and be transparent enough for the reported figures to be reproduced.",
    summaryAr:
      "يجب أن يشمل الرصد والإبلاغ جميع مصادر الانبعاثات وتدفقات المصادر، مع تجنب الاحتساب المزدوج، وبقدر من الشفافية يتيح إعادة احتساب الأرقام المبلغ عنها.",
    ...TGD,
    confidence: "verified",
    tags: ["completeness", "transparency", "methane"],
  },
  {
    id: "EAD-TGD-DATA-GAPS",
    citation: "EAD TGD, Step 3 (data gaps)",
    title: "Prevent and report data gaps and deviations",
    titleAr: "منع فجوات البيانات والإبلاغ عنها",
    summary:
      "Operators must prevent data gaps and report any data gap, the substitution method used and any deviation from the Monitoring Plan in the emissions report.",
    summaryAr:
      "يلتزم المشغل بمنع فجوات البيانات، والإبلاغ في تقرير الانبعاثات عن أي فجوة وعن طريقة الاستعاضة المستخدمة وعن أي انحراف عن خطة الرصد.",
    ...TGD,
    confidence: "verified",
    tags: ["data gaps", "deviations", "substitution"],
  },
  {
    id: "EAD-TGD-CATEGORIES",
    citation: "EAD TGD, App. 1.3 Step 3 (categories)",
    title: "Source stream categories and de minimis claims",
    titleAr: "تصنيف تدفقات المصادر والمصادر الضئيلة",
    summary:
      "Source streams are Major, Minor or De-minimis by their share of emissions (de minimis: jointly under 1 kt CO2e or under 2% of the total, up to 20 kt). A de minimis claim needs a quantified estimate.",
    summaryAr:
      "تصنف تدفقات المصادر إلى رئيسية وثانوية وضئيلة بحسب حصتها من الانبعاثات (الضئيلة: أقل من 1,000 طن مجتمعة أو أقل من 2% من الإجمالي بحد أقصى 20,000 طن)، ويجب أن يستند تصنيف أي مصدر على أنه ضئيل إلى تقدير كمي.",
    ...TGD,
    confidence: "verified",
    tags: ["categories", "de minimis", "major", "minor"],
  },
  {
    id: "EAD-TGD-TIERS",
    citation: "EAD TGD, App. 1.3 (tiers)",
    title: "Monitoring tiers",
    titleAr: "مستويات الرصد",
    summary:
      "Activity data tiers set the maximum uncertainty (Tier 1 7.5%, Tier 2 5%, Tier 3 2.5%, Tier 4 1.5%). Major source streams must be monitored at least at Tier 2, and the declared tier must reflect the method actually used.",
    summaryAr:
      "تحدد مستويات بيانات النشاط الحد الأقصى لعدم اليقين (المستوى 1: 7.5%، المستوى 2: 5%، المستوى 3: 2.5%، المستوى 4: 1.5%)، ويجب رصد تدفقات المصادر الرئيسية بالمستوى 2 على الأقل، وأن يعكس المستوى المعلن الطريقة المطبقة فعلياً.",
    ...TGD,
    confidence: "verified",
    tags: ["tiers", "uncertainty", "meters"],
  },
  {
    id: "EAD-TGD-FALLBACK",
    citation: "EAD TGD, Fallback approach",
    title: "Fallback methods need justification",
    titleAr: "شروط استخدام النهج البديل",
    summary:
      "A fallback approach may only be used with a documented justification that the tier methods are not feasible, and with an overall uncertainty of no more than 7.5%.",
    summaryAr:
      "لا يجوز استخدام النهج البديل إلا بمبرر موثق يثبت تعذر تطبيق منهجيات المستويات، وبنسبة عدم يقين إجمالية لا تتجاوز 7.5%.",
    ...TGD,
    confidence: "verified",
    tags: ["fallback", "uncertainty", "estimates"],
  },
  {
    id: "EAD-TGD-METHODS",
    citation: "EAD TGD, Appendix 1.2 (methods)",
    title: "Calculation methods and factors",
    titleAr: "منهجيات الحساب والمعاملات",
    summary:
      "Combustion emissions are activity data x net calorific value x emission factor x oxidation factor. Local or technology-specific factors should be used where available; IPCC defaults are the fallback.",
    summaryAr:
      "تحسب انبعاثات الاحتراق بضرب بيانات النشاط في صافي القيمة الحرارية ومعامل الانبعاث ومعامل الأكسدة، مع استخدام المعاملات المحلية أو الخاصة بالتقنية متى توفرت، والقيم الافتراضية للهيئة الحكومية الدولية كبديل.",
    ...TGD,
    confidence: "verified",
    tags: ["calculation", "emission factor", "NCV"],
  },
  {
    id: "EAD-TGD-VERIFICATION",
    citation: "EAD TGD, Step 4 (verification)",
    title: "Third-party verification",
    titleAr: "التحقق من طرف ثالث",
    summary:
      "Reports are verified by a verifier accredited to ISO 14065, including a site visit. EAD treats verification as voluntary until 2027, but the verifier's opinion and recommendations must be taken into account and represented accurately.",
    summaryAr:
      "يتم التحقق من التقارير بواسطة جهة تحقق معتمدة وفق المعيار ISO 14065 مع زيارة ميدانية، والتحقق طوعي حتى عام 2027، إلا أنه يجب مراعاة رأي جهة التحقق وتوصياتها وعرضها بدقة.",
    ...TGD,
    confidence: "verified",
    tags: ["verification", "ISO 14065", "accreditation"],
  },
  {
    id: "EAD-TGD-CORRECTIONS",
    citation: "EAD TGD, Step 5 (corrections)",
    title: "Correct errors within 30 days",
    titleAr: "تصحيح الأخطاء خلال 30 يوماً",
    summary: "Errors and misstatements found in a submitted report must be corrected, and a corrected report submitted, within 30 days of discovery.",
    summaryAr: "يجب تصحيح الأخطاء والبيانات غير الصحيحة المكتشفة في التقرير المقدم، وتقديم تقرير مصحح، خلال 30 يوماً من تاريخ اكتشافها.",
    ...TGD,
    confidence: "verified",
    tags: ["corrections", "30 days", "resubmission"],
  },
  {
    id: "EAD-TGD-INSPECTION",
    citation: "EAD TGD, Step 6 (compliance)",
    title: "Inspection and enforcement",
    titleAr: "التفتيش والإنفاذ",
    summary: "EAD may inspect facilities and request information, and may suspend activities and publish the names of non-compliant facilities.",
    summaryAr: "يجوز للهيئة تفتيش المنشآت وطلب المعلومات، كما يجوز لها تعليق الأنشطة ونشر أسماء المنشآت غير الملتزمة.",
    ...TGD,
    confidence: "verified",
    tags: ["inspection", "enforcement", "publication"],
  },
  {
    id: "IPCC-2006-DEFAULTS",
    citation: "IPCC 2006 Guidelines, Vol. 2 Ch. 2",
    title: "IPCC default emission factors",
    titleAr: "معاملات الانبعاث الافتراضية للهيئة الحكومية الدولية المعنية بتغير المناخ",
    summary:
      "IPCC 2006 defaults (natural gas 56.1 t CO2/TJ; diesel 74.1 t CO2/TJ and 43 GJ/t; CH4 1 and 3 kg/TJ) are Tier 1 values. A default factor is not a site-specific (Tier 3) factor.",
    summaryAr:
      "القيم الافتراضية للهيئة الحكومية الدولية لعام 2006 (الغاز الطبيعي 56.1 طن ثاني أكسيد الكربون لكل تيراجول، والديزل 74.1 طن لكل تيراجول و43 جيجاجول لكل طن، والميثان 1 و3 كجم لكل تيراجول) هي قيم المستوى 1، ولا تعد معاملات خاصة بالموقع (المستوى 3).",
    instrument: "2006 IPCC Guidelines for National Greenhouse Gas Inventories",
    jurisdiction: "International",
    sourceUrl: "https://www.ipcc-nggip.iges.or.jp/public/2006gl/vol2.html",
    sourceTitle: "2006 IPCC Guidelines, Volume 2: Energy",
    confidence: "verified",
    tags: ["emission factor", "default", "Tier 1"],
  },
  {
    id: "IPCC-AR5-GWP",
    citation: "IPCC AR5 WG1, Ch. 8, Table 8.7",
    title: "Global warming potential of methane",
    titleAr: "إمكانية الاحترار العالمي للميثان",
    summary: "Methane is converted to CO2e with the IPCC AR5 100-year GWP of 28, consistent with UNFCCC reporting under the Paris Agreement.",
    summaryAr: "يحول الميثان إلى مكافئ ثاني أكسيد الكربون باستخدام إمكانية الاحترار العالمي لمدة 100 عام البالغة 28 وفق التقرير التقييمي الخامس، بما يتسق مع الإبلاغ بموجب اتفاق باريس.",
    instrument: "IPCC Fifth Assessment Report (AR5), Working Group I",
    jurisdiction: "International",
    sourceUrl: "https://www.ipcc.ch/report/ar5/wg1/",
    sourceTitle: "IPCC AR5 Climate Change 2013: The Physical Science Basis, Chapter 8",
    confidence: "verified",
    tags: ["GWP", "methane", "CO2e"],
  },
] satisfies Rule[];

/** Compile-time check that the corpus covers every RuleId. */
type MissingRuleIds = Exclude<RuleId, (typeof REGULATIONS)[number]["id"]>;
export const ALL_RULES_COVERED: MissingRuleIds extends never ? true : MissingRuleIds = true;

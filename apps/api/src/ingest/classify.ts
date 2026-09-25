import type { DocumentKind } from "@zerocarbon/shared";

const NAME_RULES: [RegExp, DocumentKind][] = [
  [/ead[-_ ]?mrv|emissions?[-_ ]?report/i, "emissions_report"],
  [/cover[-_ ]?letter/i, "cover_letter"],
  [/monitoring[-_ ]?plan/i, "monitoring_plan"],
  [/verification[-_ ]?(statement|opinion|report)/i, "verification_statement"],
  [/calibration/i, "calibration_certificates"],
  [/gas[-_ ]?analysis|analysis[-_ ]?certificate|\bgc[-_ ]?report/i, "gas_analysis_certificate"],
  [/ldar|leak[-_ ]?detection/i, "ldar_survey"],
  [/flare[-_ ]?log/i, "flare_log"],
  [/fuel[-_ ]?(gas[-_ ]?)?meter/i, "fuel_meter_log"],
  [/diesel|invoices?\b/i, "diesel_invoices"],
  [/production|gas[-_ ]?balance/i, "production_gas_balance"],
];

const TEXT_RULES: [RegExp, DocumentKind][] = [
  [/verification statement|verification opinion|reasonable assurance|limited assurance/i, "verification_statement"],
  [/calibration certificate|certificate of calibration/i, "calibration_certificates"],
  [/certificate of analysis|gas analysis|chromatograph/i, "gas_analysis_certificate"],
  [/leak detection and repair|\bLDAR\b|optical gas imaging/i, "ldar_survey"],
  [/monitoring plan/i, "monitoring_plan"],
  [/\bdear\b|\bsubject:|submission of/i, "cover_letter"],
];

/** Kind of an evidence CSV from its header columns, if recognised. */
export function detectCsvKind(header: string[]): DocumentKind | undefined {
  const h = header.map((c) => c.trim().toLowerCase());
  const has = (re: RegExp) => h.some((c) => re.test(c));
  if (has(/date/) && has(/hp.*sm3|fl-?501/)) return "flare_log";
  if (has(/invoice/) && has(/litre|liter|mass|volume/)) return "diesel_invoices";
  if (has(/month/) && has(/oil/) && has(/flare|balance/)) return "production_gas_balance";
  if (has(/month/) && has(/meter/) && has(/volume|sm3/)) return "fuel_meter_log";
  return undefined;
}

/** Classify a submission file: file-name patterns first, then content (PDF text or CSV header). */
export function classifyDocument(relativePath: string, hint?: { firstText?: string; csvHeader?: string[] }): DocumentKind {
  const name = relativePath.split(/[\\/]/).pop() ?? relativePath;
  const byName = NAME_RULES.find(([re]) => re.test(name))?.[1];
  if (byName) return byName;
  if (/\.xls[xm]$/i.test(name)) return "emissions_report";
  const byHeader = hint?.csvHeader && detectCsvKind(hint.csvHeader);
  if (byHeader) return byHeader;
  const text = hint?.firstText?.slice(0, 3000);
  return (text && TEXT_RULES.find(([re]) => re.test(text))?.[1]) || "other";
}

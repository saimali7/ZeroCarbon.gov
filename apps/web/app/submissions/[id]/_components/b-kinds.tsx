import type { DecisionAction, DocumentKind, EvidenceRef, FindingCategory, SubmissionDocument } from "@zerocarbon/shared";
import type { Tone } from "../../../_components/ui/pill";
import { CATEGORY_LABEL } from "../../../_lib/format";

export const KIND_LABEL: Record<DocumentKind, string> = {
  emissions_report: "Emissions report workbook",
  monitoring_plan: "Monitoring plan",
  verification_statement: "Verification statement",
  cover_letter: "Cover letter",
  calibration_certificates: "Calibration certificates",
  gas_analysis_certificate: "Gas analysis certificate",
  ldar_survey: "LDAR survey",
  flare_log: "Flare log",
  fuel_meter_log: "Fuel gas meter log",
  diesel_invoices: "Diesel invoices",
  production_gas_balance: "Production and gas balance",
  other: "Other document",
};

export const DECISION_TONE: Record<DecisionAction, Tone> = {
  approve: "ok",
  request_clarification: "gold",
  escalate_inspection: "bad",
  refer_penalty: "bad",
};

export type ViewKind = "pdf" | "csv" | "text";

/** How a cited file is rendered in the evidence drawer, from its media type or extension. */
export function viewKindFor(fileName: string, doc?: SubmissionDocument): ViewKind {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (doc?.mediaType === "application/pdf" || ext === "pdf") return "pdf";
  if (doc?.mediaType === "text/csv" || ext === "csv") return "csv";
  return "text";
}

/** Human label for the cited document: its kind, or regulator reference data for files outside the package. */
export function documentLabel(evidence: EvidenceRef, doc?: SubmissionDocument): string {
  if (doc) return KIND_LABEL[doc.kind];
  if (evidence.documentId.startsWith("ref-")) return "Regulator reference data";
  return "Submitted document";
}

/** Category label for findings and checks; "Evidence" alone reads like a heading, so name the cross-check. */
export function categoryLabel(category: FindingCategory): string {
  return category === "evidence" ? "Evidence cross-check" : CATEGORY_LABEL[category];
}

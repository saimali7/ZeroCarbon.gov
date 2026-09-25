import type {
  DecisionAction,
  FindingCategory,
  FindingOutcome,
  ReviewStatus,
  RiskBand,
  Sector,
  Severity,
  SubmissionStage,
} from "@zerocarbon/shared";

const intFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const dateLong = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dubai" });
const dateShort = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dubai" });
const dateTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Dubai",
});

/** 274896 → "274,896" */
export function formatInt(value: number | undefined | null): string {
  return value === undefined || value === null || Number.isNaN(value) ? "-" : intFmt.format(value);
}

/** Fixed decimals with grouping: formatNumber(10.652, 2) → "10.65" */
export function formatNumber(value: number | undefined | null, decimals = 1): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Signed percentage: -9.04 → "-9.0%", 2.5 → "+2.5%" */
export function formatPct(value: number | undefined | null, decimals = 1, signed = true): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "-";
  const text = `${Math.abs(value).toFixed(decimals)}%`;
  if (!signed || value === 0) return value < 0 ? `-${text}` : text;
  return value < 0 ? `-${text}` : `+${text}`;
}

/** Tonnes with unit: 54179 → "54,179 t CO2e" (use <Co2e /> in JSX when subscripts matter). */
export function formatTco2e(value: number | undefined | null): string {
  return value === undefined || value === null ? "-" : `${formatInt(value)} t CO2e`;
}

/** Compact tonnes for tight spaces: 274896 → "274.9 kt", 1284300 → "1.28 Mt" */
export function formatTonnesCompact(value: number | undefined | null): string {
  if (value === undefined || value === null) return "-";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)} Mt`;
  if (Math.abs(value) >= 10_000) return `${(value / 1000).toFixed(1)} kt`;
  return `${formatInt(value)} t`;
}

export function formatDate(iso: string | undefined | null): string {
  if (!iso) return "-";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00+04:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : dateLong.format(d);
}

export function formatDateShort(iso: string | undefined | null): string {
  if (!iso) return "-";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00+04:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : dateShort.format(d);
}

export function formatDateTime(iso: string | undefined | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateTime.format(d);
}

/** 1834 → "1.8 s", 420 → "420 ms", 95000 → "1 min 35 s" */
export function formatDuration(ms: number | undefined | null): string {
  if (ms === undefined || ms === null) return "-";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const m = Math.floor(ms / 60_000);
  return `${m} min ${Math.round((ms % 60_000) / 1000)} s`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  compliant: "Compliant",
  needs_clarification: "Needs clarification",
  non_compliant: "Non-compliant",
};

export const STAGE_LABEL: Record<SubmissionStage, string> = {
  not_reviewed: "Not reviewed",
  reviewing: "Reviewing",
  reviewed: "Awaiting decision",
  decided: "Decided",
  failed: "Review failed",
};

export const RISK_LABEL: Record<RiskBand, string> = {
  low: "Low risk",
  medium: "Medium risk",
  high: "High risk",
  critical: "Critical risk",
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
};

export const OUTCOME_LABEL: Record<FindingOutcome, string> = {
  breach: "Rule breach",
  clarification: "Needs clarification",
  signal: "Signal to investigate",
};

export const CATEGORY_LABEL: Record<FindingCategory, string> = {
  completeness: "Completeness",
  deadline: "Deadline",
  calculation: "Recalculation",
  evidence: "Evidence",
  data_gap: "Data gaps",
  emission_factor: "Emission factors",
  methane: "Methane",
  benchmark: "Peer comparison",
  trend: "Year-on-year trend",
  satellite: "Satellite methane",
  verification: "Verification",
  declaration: "Declarations",
};

export const DECISION_LABEL: Record<DecisionAction, string> = {
  approve: "Approve",
  request_clarification: "Request clarification",
  escalate_inspection: "Escalate to inspection",
  refer_penalty: "Refer for penalty",
};

/** Past tense, for records: "Clarification requested". */
export const DECISION_DONE_LABEL: Record<DecisionAction, string> = {
  approve: "Approved",
  request_clarification: "Clarification requested",
  escalate_inspection: "Escalated to inspection",
  refer_penalty: "Referred for penalty",
};

export const SECTOR_LABEL: Record<Sector, string> = {
  power: "Power and water",
  oil_and_gas: "Oil and gas",
  industry: "Industry",
  transport: "Transport",
};

export function riskBandFor(score: number): RiskBand {
  if (score >= 75) return "critical";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

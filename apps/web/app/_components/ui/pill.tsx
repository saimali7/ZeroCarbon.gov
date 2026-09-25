import type { FindingOutcome, ReviewStatus, RiskBand, Severity, SubmissionStage } from "@zerocarbon/shared";
import type { ReactNode } from "react";
import { OUTCOME_LABEL, RISK_LABEL, SEVERITY_LABEL, STAGE_LABEL, STATUS_LABEL } from "../../_lib/format";

export type Tone = "neutral" | "gold" | "ok" | "bad" | "ink";

const tones: Record<Tone, string> = {
  neutral: "bg-line-soft text-ink-2",
  gold: "bg-gold-100 text-gold-800",
  ok: "bg-ok-100 text-ok-700",
  bad: "bg-bad-100 text-bad-800",
  ink: "bg-ink text-white",
};

export function Pill({
  tone = "neutral",
  size = "md",
  icon,
  className = "",
  children,
}: {
  tone?: Tone;
  size?: "sm" | "md";
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const sizing = size === "sm" ? "h-5 px-2 text-xs" : "h-6 px-2.5 text-[13px]";
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium ${sizing} ${tones[tone]} ${className}`}>
      {icon}
      {children}
    </span>
  );
}

export const STATUS_TONE: Record<ReviewStatus, Tone> = {
  compliant: "ok",
  needs_clarification: "gold",
  non_compliant: "bad",
};

export function StatusPill({ status, size }: { status: ReviewStatus; size?: "sm" | "md" }) {
  return (
    <Pill tone={STATUS_TONE[status]} size={size}>
      {STATUS_LABEL[status]}
    </Pill>
  );
}

const STAGE_TONE: Record<SubmissionStage, Tone> = {
  not_reviewed: "neutral",
  reviewing: "gold",
  reviewed: "gold",
  decided: "ok",
  failed: "bad",
};

export function StagePill({ stage, size }: { stage: SubmissionStage; size?: "sm" | "md" }) {
  return (
    <Pill tone={STAGE_TONE[stage]} size={size}>
      {STAGE_LABEL[stage]}
    </Pill>
  );
}

export const SEVERITY_TONE: Record<Severity, Tone> = {
  critical: "bad",
  high: "bad",
  medium: "gold",
  low: "neutral",
  info: "neutral",
};

export function SeverityPill({ severity, size = "sm" }: { severity: Severity; size?: "sm" | "md" }) {
  return (
    <Pill tone={SEVERITY_TONE[severity]} size={size} className={severity === "critical" ? "ring-1 ring-bad-500/40" : ""}>
      {SEVERITY_LABEL[severity]}
    </Pill>
  );
}

const OUTCOME_TONE: Record<FindingOutcome, Tone> = {
  breach: "bad",
  clarification: "gold",
  signal: "neutral",
};

export function OutcomePill({ outcome, size = "sm" }: { outcome: FindingOutcome; size?: "sm" | "md" }) {
  return (
    <Pill tone={OUTCOME_TONE[outcome]} size={size}>
      {OUTCOME_LABEL[outcome]}
    </Pill>
  );
}

export const RISK_TONE: Record<RiskBand, Tone> = {
  low: "ok",
  medium: "gold",
  high: "bad",
  critical: "bad",
};

export function RiskPill({ band, size }: { band: RiskBand; size?: "sm" | "md" }) {
  return (
    <Pill tone={RISK_TONE[band]} size={size}>
      {RISK_LABEL[band]}
    </Pill>
  );
}

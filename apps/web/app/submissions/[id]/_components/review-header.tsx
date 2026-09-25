"use client";

import { ArrowsClockwise, Gavel, Sparkle } from "@phosphor-icons/react";
import type { Review, SubmissionDetail } from "@zerocarbon/shared";
import { Button } from "../../../_components/ui/button";
import { Card } from "../../../_components/ui/card";
import { Pill, RiskPill, StagePill, StatusPill } from "../../../_components/ui/pill";
import { RiskRing } from "../../../_components/ui/risk-ring";
import { DECISION_DONE_LABEL, SECTOR_LABEL, formatDateShort, formatDateTime, formatDuration, formatInt } from "../../../_lib/format";
import { DECISION_TONE } from "./b-kinds";

/** Page-anchoring header: facility identity on the left, review verdict (or the run action) on the right. */
export function ReviewHeader({ detail, running, onRunReview }: { detail: SubmissionDetail; running: boolean; onRunReview: () => void }) {
  const report = detail.report;
  const sector = detail.sector ?? report?.facility.sector;
  const meta: { label: string; value?: string; mono?: boolean }[] = [
    { label: "EAD ID", value: detail.eadId, mono: true },
    { label: "Permit", value: report?.facility.permit, mono: true },
    { label: "Sector", value: sector ? SECTOR_LABEL[sector] : undefined },
    { label: "Reporting year", value: String(detail.reportingYear) },
    { label: "Submitted", value: detail.submittedOn || report?.submittedOn ? formatDateShort(detail.submittedOn ?? report?.submittedOn) : undefined },
    { label: "Documents", value: formatInt(detail.documents.length || detail.documentCount) },
  ];
  const place = detail.emirate ?? report?.facility.emirate;

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-gold-700">
            Annual emissions report {detail.reportingYear}
            {place && ` · ${place}`}
          </p>
          <h1 className="mt-1 text-[26px] font-bold leading-tight tracking-tight text-balance sm:text-[30px]">{detail.facilityName}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-ink-2">
            <span>{detail.operator}</span>
            {report?.operator.nameAr && (
              <>
                <span aria-hidden className="h-4 w-px bg-line-strong" />
                <span lang="ar" dir="rtl" className="text-sm text-ink-muted">
                  {report.operator.nameAr}
                </span>
              </>
            )}
          </p>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line-soft pt-4 sm:grid-cols-3 xl:grid-cols-6">
            {meta
              .filter((m) => m.value)
              .map((m) => (
                <div key={m.label} className="min-w-0">
                  <dt className="text-xs text-ink-muted">{m.label}</dt>
                  <dd className={`mt-0.5 truncate text-sm font-medium text-ink ${m.mono ? "font-mono text-[13px]" : ""}`}>{m.value}</dd>
                </div>
              ))}
          </dl>
        </div>
        {detail.review ? (
          <Verdict detail={detail} review={detail.review} running={running} onRunReview={onRunReview} />
        ) : (
          <div className="flex shrink-0 flex-col items-start gap-3 border-t border-line pt-5 lg:items-end lg:border-t-0 lg:pt-1">
            <StagePill stage={running ? "reviewing" : detail.stage} />
            <Button size="lg" icon={<Sparkle size={18} weight="bold" aria-hidden />} busy={running} onClick={onRunReview}>
              {running ? "Reviewing" : "Run AI review"}
            </Button>
            <p className="text-[13px] text-ink-muted">AI checks. You decide.</p>
          </div>
        )}
      </div>
    </Card>
  );
}

function Verdict({ detail, review, running, onRunReview }: { detail: SubmissionDetail; review: Review; running: boolean; onRunReview: () => void }) {
  const last = detail.decisions.at(-1);
  const decision = last?.action ?? detail.decision;
  return (
    <div className="flex shrink-0 items-start gap-5 border-t border-line pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
      <RiskRing score={review.riskScore} band={review.riskBand} size="lg" />
      <div className="flex min-w-0 flex-col items-start gap-2 pt-1 lg:w-56">
        <div className="flex flex-wrap gap-1.5">
          <StatusPill status={review.status} />
          <RiskPill band={review.riskBand} />
        </div>
        {decision && (
          <div className="flex flex-col items-start gap-0.5">
            <Pill tone={DECISION_TONE[decision]} icon={<Gavel size={14} weight="bold" aria-hidden />}>
              {DECISION_DONE_LABEL[decision]}
            </Pill>
            {last && (
              <span className="text-xs text-ink-muted">
                by {last.officerName}, {formatDateShort(last.createdAt)}
              </span>
            )}
          </div>
        )}
        <p className="mt-1 text-sm text-ink-2">
          Reviewed in <span className="font-semibold tabular-nums text-ink">{formatDuration(review.durationMs)}</span>
          <span className="block text-[13px] text-ink-muted tabular-nums">{formatDateTime(review.createdAt)}</span>
        </p>
        <p className="flex items-start gap-1.5 text-[13px] leading-snug text-ink-muted">
          <Sparkle size={14} weight="duotone" aria-hidden className="mt-0.5 shrink-0 text-gold-600" />
          <span>{provenance(review)}</span>
        </p>
        <Button variant="ghost" size="sm" className="-ml-3" icon={<ArrowsClockwise size={15} weight="bold" aria-hidden />} busy={running} onClick={onRunReview}>
          {running ? "Re-running" : "Re-run review"}
        </Button>
      </div>
    </div>
  );
}

function provenance(review: Review): string {
  if (review.narrativeSource === "llm") return review.model ? `AI narrative, generated live with ${review.model}` : "AI narrative, generated live";
  if (review.narrativeSource === "cache") return "AI narrative, cached for offline demo";
  return review.aiMode === "live" ? "Template narrative, the AI model was unavailable" : "Template narrative, offline demo mode";
}

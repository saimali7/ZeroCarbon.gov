"use client";

import { ArrowRight, ChatCircleText } from "@phosphor-icons/react";
import type { Review, ReviewStatus, SubmissionSummary } from "@zerocarbon/shared";
import type { Ref } from "react";
import { DECISION_LABEL, formatDuration, formatInt, formatPct } from "../../_lib/format";
import { Button, ButtonLink } from "../ui/button";
import { Stat, Tonnes } from "../ui/figures";
import { StatusPill } from "../ui/pill";
import { RiskRing } from "../ui/risk-ring";

const ACCENT: Record<ReviewStatus, string> = {
  compliant: "bg-ok-600",
  needs_clarification: "bg-gold-500",
  non_compliant: "bg-bad-500",
};

/** Verdict summary after a run completes, with the way into the full review. The heading takes focus when it appears. */
export function AssistantResult({
  review,
  submission,
  uploadMs,
  onAsk,
  headingRef,
}: {
  review: Review;
  submission: SubmissionSummary;
  uploadMs?: number;
  onAsk: () => void;
  headingRef?: Ref<HTMLHeadingElement>;
}) {
    const m = review.metrics;
    const breaches = review.findings.filter((f) => f.outcome === "breach").length;
    const under = m.estimatedUnderReportingTco2e;
    const facility = submission.facilityShortName || submission.facilityName;
    return (
      <div className="relative overflow-hidden rounded-card border border-line bg-surface">
        <span aria-hidden className={`absolute inset-x-0 top-0 h-1 ${ACCENT[review.status]}`} />
        <div className="flex flex-col gap-4 px-4 pb-4 pt-5 sm:px-5">
          <div className="flex items-start gap-4">
            <RiskRing score={review.riskScore} band={review.riskBand} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={review.status} />
                <span className="text-[13px] text-ink-muted">
                  {facility}
                  {submission.eadId && (
                    <>
                      , <span className="whitespace-nowrap">{submission.eadId}</span>
                    </>
                  )}
                </span>
              </div>
              <h3 ref={headingRef} tabIndex={-1} style={{ outline: "none" }} className="mt-2 text-[17px] font-semibold leading-snug">
                {review.headline}
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-x-5 gap-y-4 min-[440px]:grid-cols-2 rounded-control border border-line-soft bg-sunken/50 px-4 py-3.5 lg:grid-cols-4">
            <Stat label="Reported total" value={<Tonnes value={m.reportedTotalTco2e} />} />
            <Stat
              label="Estimated under-reporting"
              tone={under > 0 ? "bad" : "default"}
              value={<Tonnes value={under} unit={under > 0} />}
              sub={under > 0 ? `${formatPct(m.estimatedUnderReportingPct, 1, false)} of the reported total` : "None found"}
            />
            <Stat
              label="Findings"
              value={formatInt(review.findings.length)}
              sub={review.findings.length === 0 ? "No issues" : `${formatInt(breaches)} ${breaches === 1 ? "breach" : "breaches"}`}
            />
            <Stat label="Recommended action" value={<span className="text-base leading-snug">{DECISION_LABEL[review.recommendedAction.primary]}</span>} />
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-ink-muted">
              Reviewed in <span className="tabular-nums">{formatDuration(review.durationMs)}</span>
              {uploadMs !== undefined && (
                <>
                  , uploaded in <span className="tabular-nums">{formatDuration(uploadMs)}</span>
                </>
              )}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row-reverse">
              <ButtonLink variant="primary" href={`/submissions/${submission.id}`} icon={<ArrowRight size={18} weight="bold" aria-hidden />} className="flex-row-reverse">
                Open full review
              </ButtonLink>
              <Button variant="ghost" onClick={onAsk} icon={<ChatCircleText size={18} aria-hidden />}>
                Ask a question
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
}

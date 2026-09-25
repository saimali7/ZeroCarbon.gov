"use client";

import { CheckCircle, Clock, EnvelopeSimple, Gavel, MagnifyingGlass, Scales, SealCheck, SealWarning, WarningCircle, XCircle, type Icon } from "@phosphor-icons/react";
import type { DecisionAction, Review, ReviewMetrics, ReviewStatus, SubmissionDetail } from "@zerocarbon/shared";
import { Card } from "../../../_components/ui/card";
import { EvidenceChip } from "../../../_components/ui/evidence";
import { Co2e, Stat } from "../../../_components/ui/figures";
import { Pill } from "../../../_components/ui/pill";
import { RuleChips } from "../../../_components/ui/rules";
import { Notice } from "../../../_components/ui/states";
import { DECISION_LABEL, formatInt, formatNumber, formatPct } from "../../../_lib/format";

const ACCENT: Record<ReviewStatus, { border: string; text: string; icon: Icon }> = {
  non_compliant: { border: "border-t-bad-500", text: "text-bad-700", icon: XCircle },
  needs_clarification: { border: "border-t-gold-500", text: "text-gold-700", icon: WarningCircle },
  compliant: { border: "border-t-ok-600", text: "text-ok-700", icon: CheckCircle },
};

const ACTION_ICON: Record<DecisionAction, { icon: Icon; className: string }> = {
  approve: { icon: CheckCircle, className: "text-ok-600" },
  request_clarification: { icon: EnvelopeSimple, className: "text-gold-600" },
  escalate_inspection: { icon: MagnifyingGlass, className: "text-bad-700" },
  refer_penalty: { icon: Gavel, className: "text-bad-700" },
};

/** The AI verdict: headline, key numbers, recommended action, legal exposure and extra AI observations. */
export function ReviewSummary({ review }: { detail: SubmissionDetail; review: Review }) {
  const accent = ACCENT[review.status];
  const rec = review.recommendedAction;
  const action = ACTION_ICON[rec.primary];
  return (
    <Card aria-labelledby="review-summary-title" className={`border-t-[3px] ${accent.border}`}>
      <div className="px-5 py-5 sm:px-6">
        <p className={`flex items-center gap-1.5 text-[13px] font-medium ${accent.text}`}>
          <accent.icon size={16} weight="fill" aria-hidden />
          AI verdict
        </p>
        <h2 id="review-summary-title" className="mt-1.5 text-[21px] font-semibold leading-snug tracking-tight text-pretty">
          {review.headline}
        </h2>
        <p className="mt-2 max-w-[78ch] text-[15px] leading-relaxed text-ink-2 text-pretty">{review.summary}</p>
        <Metrics m={review.metrics} />
      </div>

      <section aria-labelledby="recommended-action-title" className="border-t border-line px-5 py-5 sm:px-6">
        <h3 id="recommended-action-title" className="text-[13px] font-medium text-ink-muted">
          Recommended action
        </h3>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="flex items-center gap-2 text-lg font-semibold leading-snug">
            <action.icon size={20} weight="duotone" aria-hidden className={action.className} />
            {DECISION_LABEL[rec.primary]}
          </p>
          {rec.responseDays !== undefined && (
            <Pill tone="gold" icon={<Clock size={14} weight="bold" aria-hidden />}>
              Operator response within {rec.responseDays} days
            </Pill>
          )}
        </div>
        <p className="mt-2 max-w-[78ch] text-[15px] leading-relaxed text-ink-2 text-pretty">{rec.rationale}</p>
        {rec.alsoConsider.length > 0 && (
          <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            Also consider
            {rec.alsoConsider.map((a) => (
              <Pill key={a} size="sm">
                {DECISION_LABEL[a]}
              </Pill>
            ))}
          </p>
        )}
        <RuleChips ruleIds={rec.ruleIds} className="mt-3" />
        {review.legalExposure && (
          <Notice tone="neutral" className="mt-4">
            <p className="flex items-center gap-1.5 font-semibold text-ink">
              <Scales size={16} weight="bold" aria-hidden className="text-ink-muted" />
              Legal exposure if not remedied
            </p>
            <p className="mt-1">{review.legalExposure.text}</p>
            <RuleChips ruleIds={review.legalExposure.ruleIds} className="mt-2.5" />
          </Notice>
        )}
      </section>

      {review.aiObservations.length > 0 && (
        <section aria-labelledby="ai-observations-title" className="border-t border-line px-5 py-5 sm:px-6">
          <h3 id="ai-observations-title" className="text-[15px] font-semibold">
            AI observations
          </h3>
          <p className="mt-0.5 text-[13px] text-ink-muted">Issues the AI raised beyond the rule-based checks. Quotes are matched against the documents.</p>
          <ul className="mt-3 flex flex-col gap-3">
            {review.aiObservations.map((o) => (
              <li key={o.id} className="rounded-control border border-line p-4">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                  <p className="min-w-0 font-medium leading-snug">
                    <span className="mr-2 font-mono text-xs text-ink-muted">{o.id}</span>
                    {o.title}
                  </p>
                  <Pill
                    size="sm"
                    tone={o.quotesVerified ? "ok" : "gold"}
                    icon={o.quotesVerified ? <SealCheck size={13} weight="bold" aria-hidden /> : <SealWarning size={13} weight="bold" aria-hidden />}
                  >
                    {o.quotesVerified ? "Quotes verified" : "Quotes not verified"}
                  </Pill>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{o.explanation}</p>
                {o.evidence.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {o.evidence.map((e, i) => (
                      <EvidenceChip key={`${e.documentId}-${i}`} evidence={e} />
                    ))}
                  </div>
                )}
                <RuleChips ruleIds={o.ruleIds} className="mt-2" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </Card>
  );
}

function Metrics({ m }: { m: ReviewMetrics }) {
  const under = m.estimatedUnderReportingTco2e;
  const tonnes = (text: string) => (
    <>
      t <Co2e />
      {text}
    </>
  );
  return (
    <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5 rounded-control border border-line-soft bg-sunken p-4 sm:grid-cols-3 xl:grid-cols-5">
      <Stat label="Reported total" value={formatInt(m.reportedTotalTco2e)} sub={tonnes(" as submitted")} />
      <Stat
        label="Under-reporting"
        value={formatInt(under)}
        tone={under > 0 ? "bad" : "ok"}
        sub={under > 0 ? tonnes(` estimated, ${formatPct(m.estimatedUnderReportingPct, 1, false)} of reported`) : "None estimated"}
      />
      <Stat
        label="Corrected total"
        value={formatInt(m.correctedTotalTco2e)}
        sub={m.correctedTotalTco2e === m.reportedTotalTco2e ? "Same as reported" : tonnes(" after corrections")}
      />
      <Stat
        label="Intensity"
        value={formatNumber(m.intensityKgCo2ePerBoe, 2)}
        sub={
          m.intensityKgCo2ePerBoe === undefined ? (
            "No production data"
          ) : (
            <>
              kg <Co2e />
              /boe{m.peerMedianIntensity !== undefined && `, peer median ${formatNumber(m.peerMedianIntensity, 1)}`}
            </>
          )
        }
      />
      <Stat
        label="Year on year"
        value={formatPct(m.yoyTotalPct)}
        sub={m.yoyTotalPct === undefined ? "No prior-year data" : `Total emissions; production ${formatPct(m.yoyProductionPct)}`}
      />
    </div>
  );
}

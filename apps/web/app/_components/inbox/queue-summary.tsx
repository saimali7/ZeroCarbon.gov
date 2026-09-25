"use client";

import { Cpu } from "@phosphor-icons/react";
import type { DashboardResponse } from "@zerocarbon/shared";
import { formatDuration, formatInt, formatPct } from "../../_lib/format";
import { Card } from "../ui/card";
import { Stat, Tonnes } from "../ui/figures";
import { Skeleton } from "../ui/states";

const cell = "min-w-0 lg:border-l lg:border-line lg:pl-6 lg:first:border-l-0 lg:first:pl-0";

/** One card with the queue's headline numbers. Renders nothing if the dashboard cannot load. */
export function QueueSummary({ data, loading }: { data?: DashboardResponse; loading: boolean }) {
  if (!data) return loading ? <SummarySkeleton /> : null;
  const needAction = data.byStatus.non_compliant + data.byStatus.needs_clarification;
  const notReviewed = data.submissions - data.reviewed;
  const underShare = data.totalReportedTco2e > 0 ? (data.estimatedUnderReportingTco2e / data.totalReportedTco2e) * 100 : undefined;

  return (
    <Card aria-labelledby="queue-summary-title">
      <h2 id="queue-summary-title" className="sr-only">
        Queue summary
      </h2>
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 px-5 py-5 sm:grid-cols-3 lg:grid-cols-5">
        <Stat className={cell} label="Reports received" value={formatInt(data.submissions)} sub={`Reporting year ${data.reportingYear}`} />
        <div className={cell}>
          <Stat
            label="Reviewed"
            value={
              <>
                {formatInt(data.reviewed)} <span className="text-[15px] font-normal text-ink-muted">of {formatInt(data.submissions)}</span>
              </>
            }
            sub={notReviewed > 0 ? `${formatInt(notReviewed)} not reviewed yet` : "All reports reviewed"}
          />
          <div aria-hidden className="mt-2 h-1 overflow-hidden rounded-full bg-line-soft">
            <div
              className="h-full rounded-full bg-gold-500 transition-[width] duration-300 ease-out"
              style={{ width: `${data.submissions ? (data.reviewed / data.submissions) * 100 : 0}%` }}
            />
          </div>
        </div>
        <Stat
          className={cell}
          label="Need action"
          tone={needAction > 0 ? "bad" : "default"}
          value={formatInt(needAction)}
          sub={
            data.reviewed === 0
              ? "No reports reviewed yet"
              : `${formatInt(data.byStatus.non_compliant)} non-compliant, ${formatInt(data.byStatus.needs_clarification)} to clarify`
          }
        />
        <Stat
          className={cell}
          label="Estimated under-reporting"
          tone={data.estimatedUnderReportingTco2e > 0 ? "bad" : "default"}
          value={data.reviewed === 0 ? "-" : <Tonnes value={data.estimatedUnderReportingTco2e} className="[&>span]:text-[15px]" />}
          sub={
            data.reviewed === 0
              ? "Shown after review"
              : underShare !== undefined
                ? `${formatPct(underShare, 1, false)} of all reported emissions`
                : "From reviewed reports"
          }
        />
        <Stat
          className={cell}
          label="Average review time"
          value={formatDuration(data.averageReviewMs)}
          sub={data.averageReviewMs === undefined ? "No reviews yet" : "Per report, all checks"}
        />
      </div>
      <p className="flex items-center gap-1.5 border-t border-line px-5 py-2.5 text-[13px] text-ink-muted">
        <Cpu size={15} aria-hidden />
        AI mode: {data.aiMode === "live" ? "Live AI" : "Demo mode, offline"}
      </p>
    </Card>
  );
}

function SummarySkeleton() {
  return (
    <Card aria-busy="true" aria-label="Loading queue summary">
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 px-5 py-5 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={`flex flex-col gap-2 ${cell}`}>
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="border-t border-line px-5 py-3">
        <Skeleton className="h-3.5 w-40" />
      </div>
    </Card>
  );
}

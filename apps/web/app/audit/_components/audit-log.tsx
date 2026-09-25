"use client";

import {
  ArrowCounterClockwise,
  ArrowsClockwise,
  CaretDown,
  CheckCircle,
  ClockCounterClockwise,
  FileText,
  Gavel,
  PencilSimple,
  Play,
  SealCheck,
  Tray,
  WarningCircle,
  type Icon,
} from "@phosphor-icons/react";
import type { AuditEvent, AuditEventType, SubmissionSummary } from "@zerocarbon/shared";
import Link from "next/link";
import { useMemo, useState } from "react";
import { api } from "../../_lib/api";
import { formatDateTime, formatInt } from "../../_lib/format";
import { useResource } from "../../_lib/use-resource";
import { Button } from "../../_components/ui/button";
import { Card, CardHeader, PageHeading } from "../../_components/ui/card";
import { EmptyState, ErrorState, Skeleton } from "../../_components/ui/states";

const EVENTS: Record<AuditEventType, { label: string; icon: Icon; tone: string }> = {
  submission_received: { label: "Submission received", icon: Tray, tone: "bg-line-soft text-ink-2" },
  review_started: { label: "Review started", icon: Play, tone: "bg-gold-50 text-gold-700" },
  review_completed: { label: "Review completed", icon: CheckCircle, tone: "bg-ok-50 text-ok-700" },
  review_failed: { label: "Review failed", icon: WarningCircle, tone: "bg-bad-50 text-bad-700" },
  decision_recorded: { label: "Decision recorded", icon: Gavel, tone: "bg-gold-100 text-gold-800" },
  letter_drafted: { label: "Letter drafted", icon: FileText, tone: "bg-line-soft text-ink-2" },
  letter_updated: { label: "Letter edited", icon: PencilSimple, tone: "bg-line-soft text-ink-2" },
  letter_approved: { label: "Letter approved", icon: SealCheck, tone: "bg-ok-50 text-ok-700" },
  demo_reset: { label: "Demo reset", icon: ArrowCounterClockwise, tone: "bg-line-soft text-ink-muted" },
};

const EVENT_TYPES = Object.keys(EVENTS) as AuditEventType[];

type Filter = AuditEventType | "all";

/** Every recorded event, newest first, with a filter by event type. */
export function AuditLog() {
  const events = useResource((signal) => api.audit(undefined, signal), []);
  const submissions = useResource((signal) => api.submissions(signal), []);
  const [type, setType] = useState<Filter>("all");
  const [refreshing, setRefreshing] = useState(false);

  const byId = useMemo(() => new Map((submissions.data ?? []).map((s) => [s.id, s])), [submissions.data]);
  const sorted = useMemo(() => [...(events.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [events.data]);
  const counts = useMemo(() => {
    const map = new Map<AuditEventType, number>();
    for (const e of sorted) map.set(e.type, (map.get(e.type) ?? 0) + 1);
    return map;
  }, [sorted]);
  const rows = type === "all" ? sorted : sorted.filter((e) => e.type === type);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([events.reload(), submissions.reload()]);
    setRefreshing(false);
  };

  const total = sorted.length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="Audit log"
        description="Every submission, review, decision and letter is recorded with the time and who acted. Times are Gulf Standard Time (UTC+4)."
        actions={
          <Button variant="secondary" onClick={refresh} busy={refreshing} disabled={events.status === "loading"} icon={<ArrowsClockwise size={18} aria-hidden />}>
            Refresh
          </Button>
        }
      />

      <Card>
        <CardHeader
          title="Events"
          description={events.data ? `${formatInt(total)} ${total === 1 ? "event" : "events"}, newest first` : "Newest first"}
        />
        {total > 0 && (
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-3">
            <div className="w-full sm:w-72">
              <label htmlFor="audit-type" className="block text-[13px] font-medium">
                Event type
              </label>
              <div className="relative mt-1">
                <select
                  id="audit-type"
                  value={type}
                  onChange={(e) => setType(e.target.value as Filter)}
                  className="h-10 w-full appearance-none rounded-field border border-line-strong bg-surface pl-3 pr-9 text-sm transition-colors hover:border-ink-faint focus-visible:border-gold-500"
                >
                  <option value="all">All events ({formatInt(total)})</option>
                  {EVENT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {EVENTS[t].label} ({formatInt(counts.get(t) ?? 0)})
                    </option>
                  ))}
                </select>
                <CaretDown size={14} weight="bold" aria-hidden className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
              </div>
            </div>
            <p aria-live="polite" className="text-[13px] tabular-nums text-ink-muted">
              {type === "all" ? "" : `${formatInt(rows.length)} of ${formatInt(total)} events shown`}
            </p>
          </div>
        )}
        {events.status === "error" && events.data && (
          <p role="alert" className="border-b border-bad-200 bg-bad-50 px-5 py-2.5 text-sm text-bad-800">
            Could not refresh the log: {events.error}
          </p>
        )}
        <AuditBody status={events.status} error={events.error} total={total} rows={rows} byId={byId} onRetry={refresh} onShowAll={() => setType("all")} />
      </Card>
    </div>
  );
}

function AuditBody({
  status,
  error,
  total,
  rows,
  byId,
  onRetry,
  onShowAll,
}: {
  status: "loading" | "ready" | "error";
  error?: string;
  total: number;
  rows: AuditEvent[];
  byId: Map<string, SubmissionSummary>;
  onRetry: () => void;
  onShowAll: () => void;
}) {
  if (status === "loading") return <AuditSkeleton />;
  if (status === "error" && total === 0)
    return (
      <div className="px-5 py-4">
        <ErrorState title="Could not load the audit log" message={error ?? "Something went wrong."} onRetry={onRetry} />
      </div>
    );
  if (total === 0)
    return (
      <div className="px-5 py-4">
        <EmptyState
          icon={<ClockCounterClockwise size={20} weight="duotone" aria-hidden />}
          title="No activity yet"
          description="Events appear here when submissions are received, reviewed and decided, and when letters are drafted or approved."
        />
      </div>
    );
  if (rows.length === 0)
    return (
      <div className="flex flex-col items-start gap-3 px-5 py-8">
        <p className="text-[15px] font-semibold">No events of this type yet</p>
        <Button variant="secondary" size="sm" onClick={onShowAll}>
          Show all events
        </Button>
      </div>
    );
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[900px] table-fixed border-collapse text-left text-sm">
          <caption className="sr-only">Audit events, newest first</caption>
          <thead className="border-b border-line bg-sunken text-[13px] text-ink-muted">
            <tr>
              {[
                ["Time", "w-[124px]"],
                ["Event", "w-[210px]"],
                ["Submission", "w-[200px]"],
                ["Actor", "w-[170px]"],
                ["Message", ""],
              ].map(([h, width]) => (
                <th key={h} scope="col" className={`px-3 py-2.5 font-medium first:pl-5 last:pr-5 ${width}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((e) => (
              <tr key={e.id} className="align-top">
                <td className="whitespace-nowrap py-3 pl-5 pr-3 tabular-nums text-ink-2">
                  <time dateTime={e.createdAt} title={e.createdAt}>
                    {formatDateTime(e.createdAt)}
                  </time>
                </td>
                <td className="whitespace-nowrap px-3 py-3">
                  <EventLabel type={e.type} />
                </td>
                <td className="px-3 py-3">
                  <SubmissionRef id={e.submissionId} byId={byId} />
                </td>
                <td className="px-3 py-3 text-ink-2">{e.actor}</td>
                <td className="py-3 pl-3 pr-5 leading-relaxed text-ink-2">
                  <span className="line-clamp-3 break-words">{e.message}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-line md:hidden">
        {rows.map((e) => (
          <li key={e.id} className="flex flex-col gap-2 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <EventLabel type={e.type} />
              <time dateTime={e.createdAt} className="shrink-0 pt-0.5 text-[13px] tabular-nums text-ink-muted">
                {formatDateTime(e.createdAt)}
              </time>
            </div>
            <p className="break-words text-sm leading-relaxed text-ink-2">{e.message}</p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-muted">
              {e.submissionId && <SubmissionRef id={e.submissionId} byId={byId} />}
              <span>By {e.actor}</span>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function EventLabel({ type }: { type: AuditEventType }) {
  const event = EVENTS[type] ?? { label: type, icon: ClockCounterClockwise, tone: "bg-line-soft text-ink-2" };
  const EventIcon = event.icon;
  return (
    <span className="inline-flex items-center gap-2 font-medium text-ink">
      <span className={`grid size-7 shrink-0 place-items-center rounded-full ${event.tone}`}>
        <EventIcon size={15} weight="bold" aria-hidden />
      </span>
      {event.label}
    </span>
  );
}

function SubmissionRef({ id, byId }: { id?: string; byId: Map<string, SubmissionSummary> }) {
  if (!id) return <span className="text-ink-faint">-</span>;
  const s = byId.get(id);
  return (
    <Link href={`/submissions/${encodeURIComponent(id)}`} className="group inline-flex max-w-full flex-col rounded-control leading-snug" title={s?.facilityName}>
      <span className="truncate font-medium text-gold-700 underline-offset-2 group-hover:underline">{s?.facilityShortName ?? id}</span>
      {s && <span className="truncate font-mono text-xs text-ink-muted">{s.eadId}</span>}
    </Link>
  );
}

function AuditSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading audit log" className="divide-y divide-line">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex flex-col gap-2 px-5 py-3.5 md:flex-row md:items-center md:gap-6">
          <Skeleton className="h-3.5 w-24" />
          <div className="flex items-center gap-2">
            <Skeleton className="size-7 rounded-full" />
            <Skeleton className="h-3.5 w-32" />
          </div>
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3.5 w-full md:flex-1" />
        </div>
      ))}
    </div>
  );
}

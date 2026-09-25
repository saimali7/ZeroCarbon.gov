"use client";

import { ListChecks, MagnifyingGlass, Tray, UploadSimple, X } from "@phosphor-icons/react";
import type { ReviewAllResponse, SubmissionSummary } from "@zerocarbon/shared";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../../_lib/api";
import { formatDuration, formatInt } from "../../_lib/format";
import { useResource } from "../../_lib/use-resource";
import { Button } from "../ui/button";
import { Card, CardBody, CardHeader, PageHeading } from "../ui/card";
import { Segmented } from "../ui/segmented";
import { EmptyState, ErrorState, Notice } from "../ui/states";
import { isReviewed, matchesSearch, QUEUE_FILTERS, sortQueue, type QueueFilter } from "./queue-model";
import { QueueSummary } from "./queue-summary";
import { ResetDemo } from "./reset-demo";
import { QueueSkeleton, SubmissionCards, SubmissionsTable } from "./submissions-table";
import { UploadDialog } from "./upload-dialog";

type Run = { startedAt: number; total: number; pending: Set<string> };
type Message = { tone: "ok" | "gold" | "bad" | "neutral"; text: ReactNode };

/** The officer inbox: summary, review-all, filters and the submissions list. */
export function ReviewQueue() {
  const submissions = useResource((signal) => api.submissions(signal), []);
  const dashboard = useResource((signal) => api.dashboard(signal), []);
  const { reload: reloadSubmissions } = submissions;
  const { reload: reloadDashboard } = dashboard;

  const [filter, setFilter] = useState<QueueFilter>("all");
  const [query, setQuery] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  const reloadAll = useCallback(() => Promise.all([reloadSubmissions(), reloadDashboard()]), [reloadSubmissions, reloadDashboard]);

  // While a batch review runs, poll so rows update as each review finishes.
  useEffect(() => {
    if (!run) return;
    const timer = setInterval(() => void reloadSubmissions(), 2000);
    return () => clearInterval(timer);
  }, [run, reloadSubmissions]);

  const all = useMemo(() => {
    const list = submissions.data ?? [];
    if (!run) return list;
    return list.map((s): SubmissionSummary => (run.pending.has(s.id) && !isReviewed(s) ? { ...s, stage: "reviewing" } : s));
  }, [submissions.data, run]);

  const searched = useMemo(() => all.filter((s) => matchesSearch(s, query)), [all, query]);
  const active = QUEUE_FILTERS.find((f) => f.value === filter) ?? QUEUE_FILTERS[0];
  const rows = useMemo(() => sortQueue(searched.filter(active.match)), [searched, active]);
  const filtering = filter !== "all" || query.trim() !== "";

  const clearFilters = () => {
    setFilter("all");
    setQuery("");
  };

  const reviewAll = async () => {
    const list = submissions.data ?? [];
    setMessage(null);
    setRun({ startedAt: performance.now(), total: list.length, pending: new Set(list.filter((s) => !isReviewed(s)).map((s) => s.id)) });
    try {
      const res = await api.reviewAll();
      setMessage(reviewAllMessage(res, new Map(list.map((s) => [s.id, s.facilityShortName]))));
    } catch (err) {
      setMessage({ tone: "bad", text: `Review all did not finish: ${err instanceof Error ? err.message : "unknown error"}` });
    }
    await reloadAll();
    setRun(null);
  };

  const onReset = () => {
    clearFilters();
    setMessage({ tone: "neutral", text: "Demo reset. Reviews, decisions, letters and uploads were cleared." });
    void reloadAll();
  };

  const count = submissions.data?.length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="Emissions reports, checked in minutes."
        description="Every 2025 report submitted under the UAE Climate Law is checked by AI against the law, the facility's own evidence and its peers, and the officer makes the decision."
        actions={
          <>
            <Button variant="secondary" onClick={() => setUploadOpen(true)} disabled={!!run} icon={<UploadSimple size={18} aria-hidden />}>
              Add submission
            </Button>
            <div className="flex items-center gap-3">
              {run && (
                <span className="text-[13px] text-ink-muted">
                  Elapsed <Elapsed since={run.startedAt} />
                </span>
              )}
              <Button onClick={reviewAll} busy={!!run} disabled={count === 0} icon={<ListChecks size={18} weight="bold" aria-hidden />}>
                {run ? `Reviewing ${formatInt(run.total)} ${run.total === 1 ? "report" : "reports"}` : "Review all"}
              </Button>
            </div>
          </>
        }
      />

      <div aria-live="polite" className="empty:hidden">
        {run && <p className="sr-only">Reviewing all reports.</p>}
        {message && (
          <Notice tone={message.tone} className="flex items-start justify-between gap-3 py-1.5! pr-1.5!">
            <div className="py-1">{message.text}</div>
            <button
              type="button"
              onClick={() => setMessage(null)}
              aria-label="Dismiss message"
              className="grid size-8 shrink-0 place-items-center rounded-control opacity-80 transition-opacity hover:opacity-100"
            >
              <X size={14} weight="bold" aria-hidden />
            </button>
          </Notice>
        )}
      </div>

      <QueueSummary data={dashboard.data} loading={dashboard.status === "loading"} />

      <Card>
        <CardHeader title="Submissions" description="Highest risk first. Open a report to see its findings, evidence and recommended action." />
        {count > 0 && (
          <div className="flex flex-col gap-3 border-b border-line px-5 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="-m-1 max-w-full overflow-x-auto p-1">
              <Segmented
                label="Filter submissions"
                value={filter}
                onChange={setFilter}
                options={QUEUE_FILTERS.map((f) => {
                  const n = searched.filter(f.match).length;
                  return {
                    value: f.value,
                    ariaLabel: `${f.label}, ${n}`,
                    label: (
                      <>
                        {f.label}
                        <span className="min-w-4 text-center text-xs tabular-nums opacity-70">{n}</span>
                      </>
                    ),
                  };
                })}
              />
            </div>
            <div className="relative w-full lg:w-80">
              <label htmlFor="queue-search" className="sr-only">
                Search by facility, operator or EAD ID
              </label>
              <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
              <input
                id="queue-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Facility, operator or EAD ID"
                autoComplete="off"
                className="h-10 w-full rounded-field border border-line-strong bg-surface pl-9 pr-3 text-sm transition-colors placeholder:text-ink-faint hover:border-ink-faint focus-visible:border-gold-500"
              />
            </div>
          </div>
        )}
        {submissions.status === "error" && submissions.data && (
          <Notice tone="bad" className="mx-5 mt-3">
            <span role="alert">Could not refresh the list: {submissions.error}</span>
          </Notice>
        )}
        <QueueBody
          status={submissions.status}
          error={submissions.error}
          count={count}
          rows={rows}
          onRetry={() => void reloadSubmissions()}
          onAdd={() => setUploadOpen(true)}
          onClearFilters={clearFilters}
        />
        <p aria-live="polite" className="sr-only">
          {submissions.data && filtering ? `${rows.length} of ${count} submissions shown` : ""}
        </p>
      </Card>

      <div className="-mt-2 flex justify-end">
        <ResetDemo onReset={onReset} disabled={!!run} />
      </div>

      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  );
}

function QueueBody({
  status,
  error,
  count,
  rows,
  onRetry,
  onAdd,
  onClearFilters,
}: {
  status: "loading" | "ready" | "error";
  error?: string;
  count: number;
  rows: SubmissionSummary[];
  onRetry: () => void;
  onAdd: () => void;
  onClearFilters: () => void;
}) {
  if (status === "loading" && count === 0) return <QueueSkeleton />;
  if (status === "error" && count === 0)
    return (
      <CardBody>
        <ErrorState title="Could not load submissions" message={error ?? "Something went wrong."} onRetry={onRetry} />
      </CardBody>
    );
  if (count === 0)
    return (
      <CardBody>
        <EmptyState
          icon={<Tray size={20} weight="duotone" aria-hidden />}
          title="No submissions yet"
          description="Reports appear here when facilities submit them. You can also add a submission package yourself, for example one of the demo folders in demo/submissions/."
          action={
            <Button variant="secondary" onClick={onAdd} icon={<UploadSimple size={18} aria-hidden />}>
              Add submission
            </Button>
          }
        />
      </CardBody>
    );
  if (rows.length === 0)
    return (
      <div className="flex flex-col items-start gap-3 px-5 py-8">
        <div>
          <p className="text-[15px] font-semibold">No submissions match these filters</p>
          <p className="mt-0.5 text-sm text-ink-muted">
            Try another filter or search term. {formatInt(count)} {count === 1 ? "submission is" : "submissions are"} in the queue.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onClearFilters}>
          Clear filters
        </Button>
      </div>
    );
  return (
    <>
      <SubmissionsTable rows={rows} />
      <SubmissionCards rows={rows} />
    </>
  );
}

function reviewAllMessage(res: ReviewAllResponse, names: Map<string, string>): Message {
  const reviewed = `${formatInt(res.reviewed)} ${res.reviewed === 1 ? "report" : "reports"} reviewed in ${formatDuration(res.durationMs)}`;
  if (res.failed === 0) return { tone: "ok", text: `${reviewed}.` };
  const failures = res.results.filter((r) => r.error);
  return {
    tone: res.reviewed === 0 ? "bad" : "gold",
    text: (
      <>
        <p>
          {reviewed}. {formatInt(res.failed)} failed.
        </p>
        <ul className="mt-1 list-disc pl-5">
          {failures.map((r) => (
            <li key={r.submissionId}>
              {names.get(r.submissionId) ?? r.submissionId}: {r.error}
            </li>
          ))}
        </ul>
      </>
    ),
  };
}

/** Seconds since `since` (a performance.now() value), updated ten times a second. */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(since);
  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(timer);
  }, []);
  return (
    <span role="timer" className="inline-block min-w-[3.5em] font-medium tabular-nums text-ink">
      {((now - since) / 1000).toFixed(1)} s
    </span>
  );
}

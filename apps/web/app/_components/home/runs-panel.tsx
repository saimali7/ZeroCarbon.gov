"use client";

import { ArrowRight, FolderOpen, Funnel } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../_lib/api";
import { formatInt } from "../../_lib/format";
import { ensureDemoRunsComplete, type ActiveRun } from "../../_lib/runs";
import { useResource } from "../../_lib/use-resource";
import { Button, ButtonLink } from "../ui/button";
import { Card, CardHeader } from "../ui/card";
import { Segmented } from "../ui/segmented";
import { EmptyState, ErrorState, Notice } from "../ui/states";
import { buildRuns, needsAction, readSession, RUN_FILTERS, toEpoch, writeSession, type RunFilter } from "./runs-model";
import { RunRow, RunRowSkeleton } from "./runs-row";

const POLL_MS = 1500;
const FLASH_MS = 2400;
/** Rows shown before "Show all", so a long history does not push the page down. */
const COLLAPSED_ROWS = 6;

/** Home element 2: every review run, with the live run from the assistant pinned on top. */
export function RunsPanel({ activeRun, refreshKey }: { activeRun: ActiveRun | null; refreshKey: number }) {
  const submissions = useResource((signal) => api.submissions(signal), [refreshKey]);
  const { reload } = submissions;
  const [filter, setFilter] = useState<RunFilter>("all");
  const [expanded, setExpanded] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [session, setSession] = useState<Record<string, number>>({});
  const [flash, setFlash] = useState<Set<string>>(() => new Set());
  const seededRef = useRef(false);

  useEffect(() => setSession(readSession()), []);

  const seed = useCallback(
    async (list: Parameters<typeof ensureDemoRunsComplete>[0]) => {
      setSeedError(null);
      setSeeding(true);
      try {
        if (await ensureDemoRunsComplete(list)) await reload();
      } catch (err) {
        setSeedError(err instanceof Error ? err.message : "Unknown error");
        await reload();
      } finally {
        setSeeding(false);
      }
    },
    [reload],
  );

  // First load on a fresh install: review the demo submissions once so there are runs to open.
  useEffect(() => {
    if (seededRef.current || submissions.status !== "ready") return;
    seededRef.current = true;
    void seed(submissions.data);
  }, [submissions.status, submissions.data, seed]);

  const markDone = useCallback((id: string, startedAt: number) => {
    const next = { ...readSession(), [id]: startedAt };
    writeSession(next);
    setSession(next);
    setFlash((prev) => new Set(prev).add(id));
    setTimeout(() => setFlash((prev) => new Set([...prev].filter((x) => x !== id))), FLASH_MS);
  }, []);

  // The live run's phase changes: refresh so the merged row picks up the server's data.
  const livePhase = activeRun?.phase;
  const liveId = activeRun?.submissionId;
  const liveStart = activeRun?.startedAt;
  useEffect(() => {
    if (livePhase) void reload();
  }, [livePhase, liveId, reload]);

  // Once the live run's review is in, remember it for this session ("New" pill, upload time) and flash the row.
  const liveReviewed = submissions.data?.some((s) => s.id === liveId && s.riskScore !== undefined) ?? false;
  const liveKnown = liveId !== undefined && session[liveId] !== undefined;
  useEffect(() => {
    if (liveId && liveStart !== undefined && livePhase === "done" && liveReviewed && !liveKnown) markDone(liveId, toEpoch(liveStart));
  }, [liveId, liveStart, livePhase, liveReviewed, liveKnown, markDone]);

  const runs = useMemo(() => buildRuns(submissions.data ?? [], activeRun, session, seeding), [submissions.data, activeRun, session, seeding]);

  const polling = seeding || runs.some((r) => r.state === "uploading" || r.state === "reviewing");
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(() => void reload(), POLL_MS);
    return () => clearInterval(timer);
  }, [polling, reload]);

  const current = RUN_FILTERS.find((f) => f.value === filter) ?? RUN_FILTERS[0];
  const shown = runs.filter(current.match);
  const actionCount = runs.filter(needsAction).length;
  const loading = submissions.status === "loading" && runs.length === 0;
  const failedFirstLoad = submissions.status === "error" && !submissions.data && runs.length === 0;

  const liveName = activeRun && (runs.find((r) => r.live)?.summary?.facilityShortName ?? activeRun.facilityName ?? activeRun.label);
  const announcement = !activeRun
    ? ""
    : activeRun.phase === "uploading"
      ? `Uploading ${liveName}.`
      : activeRun.phase === "reviewing"
        ? `Reviewing ${liveName}.`
        : activeRun.phase === "done"
          ? `Review of ${liveName} complete.`
          : `Review of ${liveName} failed.`;

  return (
    <Card aria-labelledby="runs-title" className="overflow-hidden">
      <CardHeader
        id="runs-title"
        title="Review runs"
        description="Every submission the AI has reviewed. Open a run to see the full dashboard."
        actions={
          <ButtonLink href="/queue" variant="ghost" size="sm" icon={<ArrowRight size={14} weight="bold" aria-hidden />} className="flex-row-reverse max-sm:-ml-3">
            Open review queue
          </ButtonLink>
        }
      />

      {runs.length > 0 && (
        <div className="flex flex-col gap-3 border-b border-line px-5 py-3 md:flex-row md:items-center md:justify-between">
          <div className="-m-1 max-w-full overflow-x-auto p-1">
            <Segmented
              label="Filter review runs"
              size="sm"
              className="max-sm:grid max-sm:w-full max-sm:grid-cols-2 max-sm:[&>button]:justify-center"
              value={filter}
              onChange={setFilter}
              options={RUN_FILTERS.map((f) => {
                const n = runs.filter(f.match).length;
                return {
                  value: f.value,
                  ariaLabel: `${f.label}, ${n}`,
                  label: (
                    <>
                      {f.label}
                      <span className="min-w-3 text-center text-xs tabular-nums opacity-70">{n}</span>
                    </>
                  ),
                };
              })}
            />
          </div>
          <p className="text-[13px] tabular-nums text-ink-muted" aria-live="polite">
            {formatInt(runs.length)} {runs.length === 1 ? "run" : "runs"} ·{" "}
            <span className={actionCount > 0 ? "font-medium text-bad-700" : ""}>{formatInt(actionCount)} need action</span>
          </p>
        </div>
      )}

      {submissions.status === "error" && submissions.data && (
        <Notice tone="bad" className="mx-5 mt-3 flex flex-wrap items-center justify-between gap-2 py-1.5!">
          <span role="alert">Could not refresh the list: {submissions.error}</span>
          <Button variant="ghost" size="sm" onClick={() => void reload()}>
            Try again
          </Button>
        </Notice>
      )}
      {seedError && (
        <Notice tone="gold" className="mx-5 mt-3 flex flex-wrap items-center justify-between gap-2 py-1.5!">
          <span role="alert">The sample submissions could not be reviewed: {seedError}</span>
          <Button variant="ghost" size="sm" busy={seeding} onClick={() => void seed(submissions.data ?? [])}>
            Try again
          </Button>
        </Notice>
      )}

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {loading ? (
        <ul aria-label="Loading review runs" aria-busy>
          <RunRowSkeleton />
          <RunRowSkeleton />
          <RunRowSkeleton />
        </ul>
      ) : failedFirstLoad ? (
        <div className="p-5">
          <ErrorState title="Could not load review runs" message={submissions.error} onRetry={() => void reload()} />
        </div>
      ) : runs.length === 0 ? (
        <div className="p-5">
          <EmptyState
            icon={<FolderOpen size={20} weight="duotone" aria-hidden />}
            title="No review runs yet"
            description="Drop a submission folder into the assistant above. The review starts right away and the run appears here."
          />
        </div>
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-start gap-3 px-5 py-8">
          <div className="flex items-center gap-2 text-[15px] font-semibold">
            <Funnel size={18} aria-hidden className="text-ink-muted" />
            No runs match &quot;{current.label}&quot;
          </div>
          <p className="text-sm text-ink-muted">Other runs are hidden by this filter.</p>
          <Button variant="secondary" size="sm" onClick={() => setFilter("all")}>
            Show all runs
          </Button>
        </div>
      ) : (
        <>
          <ul aria-label="Review runs">
            {(expanded ? shown : shown.slice(0, COLLAPSED_ROWS)).map((run) => (
              <RunRow key={run.key} run={run} flash={!!run.summary && flash.has(run.summary.id)} />
            ))}
          </ul>
          {shown.length > COLLAPSED_ROWS && (
            <div className="border-t border-line px-5 py-2.5">
              <Button variant="ghost" size="sm" className="-ml-3" aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
                {expanded ? "Show fewer" : `Show all ${formatInt(shown.length)} runs`}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

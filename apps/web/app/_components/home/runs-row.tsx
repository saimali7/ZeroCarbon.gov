"use client";

import { CaretRight, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { DECISION_DONE_LABEL, formatDateShort, formatDateTime, formatDuration, formatInt } from "../../_lib/format";
import { Tonnes } from "../ui/figures";
import { Pill, StagePill, StatusPill } from "../ui/pill";
import { RiskRing } from "../ui/risk-ring";
import { Skeleton } from "../ui/states";
import { formatWhen, needsAction, type RunItem } from "./runs-model";

/** Left accent colour for runs that need the officer's action (data-driven, from status). */
function accentFor(run: RunItem) {
  const s = run.summary;
  if (run.state === "failed") return "bg-bad-500";
  if (run.state !== "reviewed" || !s || s.stage === "decided") return "";
  if (s.status === "non_compliant") return "bg-bad-500";
  if (s.status === "needs_clarification") return "bg-gold-500";
  return "";
}

export function RunRow({ run, flash }: { run: RunItem; flash: boolean }) {
  const s = run.summary;
  const active = run.state === "uploading" || run.state === "reviewing";
  const accent = accentFor(run);
  const id = s?.id ?? run.live?.submissionId;
  const body = (
    <>
      {accent && <span aria-hidden className={`absolute inset-y-3 left-0 w-[3px] rounded-r-full ${accent}`} />}
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <RowRing run={run} />
        <Identity run={run} />
        {id && (
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-control text-gold-700 group-hover:bg-gold-100 md:hidden">
            <CaretRight size={18} weight="bold" />
          </span>
        )}
      </div>
      {active ? <LiveProgress run={run} /> : <Figures run={run} />}
      {id ? <OpenCue strong={needsAction(run)} /> : <span aria-hidden className="w-[76px] shrink-0 max-md:hidden" />}
    </>
  );
  const shell = `relative flex flex-col gap-4 px-5 py-4 transition-colors duration-700 md:flex-row md:items-center md:gap-6 ${
    flash ? "bg-gold-50" : active ? "bg-gold-50/40" : ""
  }`;
  return (
    <li className="border-b border-line-soft last:border-b-0">
      {id ? (
        <Link href={`/submissions/${id}`} className={`${shell} group outline-offset-[-2px] hover:bg-sunken`}>
          {body}
        </Link>
      ) : (
        <div className={shell}>{body}</div>
      )}
    </li>
  );
}

function RowRing({ run }: { run: RunItem }) {
  const s = run.summary;
  if (run.state === "reviewed" && s?.riskScore !== undefined) return <RiskRing score={s.riskScore} band={s.riskBand} size="sm" />;
  const active = run.state === "uploading" || run.state === "reviewing";
  const label = active ? "Risk score pending, review in progress" : "No risk score yet";
  return (
    <span role="img" aria-label={label} className="relative grid size-10 shrink-0 place-items-center">
      <svg
        width="40"
        height="40"
        viewBox="0 0 40 40"
        aria-hidden
        className={active ? "animate-spin [animation-duration:4s] motion-reduce:animate-none" : ""}
      >
        <circle
          cx="20"
          cy="20"
          r="17.5"
          fill="none"
          strokeWidth="2"
          strokeDasharray="4 4"
          stroke={active ? "var(--color-gold-500)" : run.state === "failed" ? "var(--color-bad-500)" : "var(--color-line-strong)"}
        />
      </svg>
      {active ? (
        <span aria-hidden className="absolute size-2 rounded-full bg-gold-500 animate-pulse motion-reduce:animate-none" />
      ) : run.state === "failed" ? (
        <WarningCircle size={16} weight="bold" aria-hidden className="absolute text-bad-700" />
      ) : (
        <span aria-hidden className="absolute text-[13px] font-bold text-ink-faint">-</span>
      )}
    </span>
  );
}

function StatePills({ run }: { run: RunItem }) {
  const s = run.summary;
  if (run.state === "uploading") return <Pill tone="gold" size="sm">Uploading</Pill>;
  if (run.state === "reviewing") return <StagePill stage="reviewing" size="sm" />;
  if (run.state === "failed") return <StagePill stage="failed" size="sm" />;
  if (!s || run.state === "not_reviewed") return <StagePill stage="not_reviewed" size="sm" />;
  return (
    <>
      {s.status ? <StatusPill status={s.status} size="sm" /> : <StagePill stage={s.stage} size="sm" />}
      {s.decision && (
        <Pill tone="neutral" size="sm">
          {DECISION_DONE_LABEL[s.decision]}
        </Pill>
      )}
      {run.isNew && (
        <Pill tone="ink" size="sm">
          New
        </Pill>
      )}
    </>
  );
}

function sourceLine(run: RunItem): string {
  const s = run.summary;
  if (run.live && !s) return run.startedAt ? `Started ${formatWhen(run.startedAt)}` : "Started just now";
  if (s?.source === "upload") return run.startedAt ? `Uploaded ${formatWhen(run.startedAt)}` : "Uploaded folder";
  return s?.submittedOn ? `Submitted ${formatDateShort(s.submittedOn)}` : "Submitted by the facility";
}

function Identity({ run }: { run: RunItem }) {
  const s = run.summary;
  const live = run.live;
  const name = s?.facilityShortName ?? live?.facilityName ?? live?.label ?? "Submission";
  const files = s?.documentCount ?? live?.fileCount;
  const reviewed = run.state === "reviewed" && s?.reviewedAt ? `Reviewed ${formatDateTime(s.reviewedAt)}` : undefined;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="min-w-0 truncate text-[15px] font-semibold text-ink" title={s?.facilityName ?? name}>
          {name}
        </span>
        <StatePills run={run} />
      </div>
      <p className="text-[13px] text-ink-muted md:truncate">
        {s ? (
          <>
            {s.operator} · <span className="whitespace-nowrap font-mono text-[12px] text-ink-2">{s.eadId}</span>
          </>
        ) : (
          <>
            {live?.facilityName && live.label !== name && (
              <>
                Folder <span className="text-ink-2">{live.label}</span>,{" "}
              </>
            )}
            {files !== undefined && `${formatInt(files)} ${files === 1 ? "file" : "files"}`}
            {!live?.facilityName && " in the dropped folder"}
          </>
        )}
      </p>
      <p className="text-xs text-ink-muted md:truncate">
        {sourceLine(run)}
        {reviewed && (
          <>
            {" · "}
            <span className="whitespace-nowrap">{reviewed}</span>
          </>
        )}
      </p>
      {run.state === "failed" && live?.error && <p className="text-[13px] text-bad-700">{live.error}</p>}
    </div>
  );
}

function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-ink md:truncate">{children}</span>
    </div>
  );
}

function Figures({ run }: { run: RunItem }) {
  const s = run.summary;
  const under = run.state === "reviewed" ? s?.estimatedUnderReportingTco2e : undefined;
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-x-4 max-md:border-t max-md:border-line-soft max-md:pt-3 md:w-[420px] md:shrink-0 md:grid-cols-[150px_70px_1fr] md:gap-x-5">
      <Figure label="Reported">
        <Tonnes value={s?.reportedTotalTco2e} />
      </Figure>
      <Figure label="Findings">{run.state === "reviewed" ? formatInt(s?.findingCount) : "-"}</Figure>
      <Figure label="Under-reporting">
        {under === undefined ? (
          "-"
        ) : under > 0 ? (
          <Tonnes value={under} className="text-bad-700" />
        ) : (
          <span className="text-ok-700">None found</span>
        )}
      </Figure>
    </div>
  );
}

function useElapsed(since: number | undefined) {
  const [now, setNow] = useState(since ?? 0);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, []);
  return since === undefined ? undefined : Math.max(0, now - since);
}

function LiveProgress({ run }: { run: RunItem }) {
  const elapsed = useElapsed(run.startedAt);
  const uploading = run.state === "uploading";
  return (
    <div className="flex flex-col gap-2 max-md:border-t max-md:border-line-soft max-md:pt-3 md:w-[420px] md:shrink-0">
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-medium text-gold-800">
          {uploading ? "Step 1 of 2: uploading files" : "Step 2 of 2: checking against the law and evidence"}
        </span>
        {elapsed !== undefined && <span className="shrink-0 tabular-nums text-ink-muted">{elapsed < 60_000 ? `${(elapsed / 1000).toFixed(1)} s` : formatDuration(elapsed)}</span>}
      </div>
      <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-gold-100">
        <div
          className={`h-full rounded-full bg-gold-500 transition-[width] duration-500 ease-out animate-pulse motion-reduce:animate-none ${
            uploading ? "w-1/3" : "w-3/4"
          }`}
        />
      </div>
    </div>
  );
}

/** "Open" affordance; filled when the run needs the officer's action. */
function OpenCue({ strong }: { strong: boolean }) {
  const look = strong ? "bg-gold-600 text-white group-hover:bg-gold-700" : "text-gold-700 group-hover:bg-gold-100 group-hover:text-gold-800";
  return (
    <span
      aria-hidden
      className={`inline-flex h-8 w-[76px] shrink-0 items-center justify-center gap-1 rounded-control text-[13px] font-medium transition-colors max-md:hidden ${look}`}
    >
      Open
      <CaretRight size={14} weight="bold" className="transition-transform duration-150 group-hover:translate-x-0.5" />
    </span>
  );
}

export function RunRowSkeleton() {
  return (
    <li className="flex flex-col gap-4 border-b border-line-soft px-5 py-4 last:border-b-0 md:flex-row md:items-center md:gap-6">
      <div className="flex flex-1 items-start gap-4">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2 pt-0.5">
          <Skeleton className="h-4 w-48 max-w-full" />
          <Skeleton className="h-3 w-64 max-w-full" />
          <Skeleton className="h-3 w-40 max-w-full" />
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-x-4 md:w-[420px] md:shrink-0 md:grid-cols-[150px_70px_1fr] md:gap-x-5">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
      <Skeleton className="h-8 w-[76px] rounded-control max-md:hidden" />
    </li>
  );
}

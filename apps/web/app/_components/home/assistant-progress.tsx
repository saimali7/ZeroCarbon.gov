"use client";

import { ArrowClockwise, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { formatDuration } from "../../_lib/format";
import { Button, Spinner } from "../ui/button";
import { runPhase, stepDetail, stepDuration, stepMs, stepsFor, type RunItem } from "./assistant-model";

/** Live progress report of one run: six steps with pending, active, done and failed states. */
export function AssistantProgress({ run, retryDisabled, onRetry }: { run: RunItem; retryDisabled: boolean; onRetry: () => void }) {
  const phase = runPhase(run);
  const steps = stepsFor(run.files.length);
  const active = run.failed ? -1 : run.done;
  const title = { uploading: "Review in progress", reviewing: "Review in progress", done: "Review complete", failed: "Review stopped" }[phase];
  const processing = run.review ? (run.uploadMs ?? 0) + run.review.durationMs : undefined;
  // Once complete, fold the steps into one line so the verdict below stays in view.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (phase !== "done") return setCollapsed(false);
    const timer = setTimeout(() => setCollapsed(true), 1400);
    return () => clearTimeout(timer);
  }, [phase]);
  const announcement =
    phase === "failed"
      ? `Stopped at: ${steps[run.failed!.step].label}`
      : phase === "done"
        ? "All steps complete"
        : `Step ${run.done + 1} of ${steps.length}: ${steps[run.done].label}`;

  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line-soft bg-sunken/60 px-4 py-2.5">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-[13px] text-ink-muted">
          {phase === "done" && processing !== undefined ? (
            <>
              Processing time <span className="font-medium tabular-nums text-ink-2">{formatDuration(processing)}</span>
            </>
          ) : (
            <>
              Elapsed <Elapsed startedAt={run.startedAt} endedAt={run.endedAt} />
            </>
          )}
        </span>
      </div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {phase === "done" && (
        <div className={`flex flex-wrap items-center justify-between gap-2 px-4 ${collapsed ? "py-3" : "pt-3"}`}>
          <span className="inline-flex items-center gap-2 text-sm text-ink-2">
            <CheckCircle size={18} weight="fill" className="text-ok-600" aria-hidden />
            All {steps.length} steps complete
          </span>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            aria-expanded={!collapsed}
            className="rounded-control px-2 py-1 text-[13px] font-medium text-gold-700 hover:bg-gold-50"
          >
            {collapsed ? "Show steps" : "Hide steps"}
          </button>
        </div>
      )}
      <ol className={`flex-col px-4 py-2 ${collapsed ? "hidden" : "flex"}`}>
        {steps.map((step, i) => {
          const state = run.failed?.step === i ? "failed" : i < run.done ? "done" : i === active ? "active" : "pending";
          const detail = state === "done" ? stepDetail(step.key, run) : state === "active" ? step.hint : undefined;
          const ms = state === "done" ? stepMs(step.key, run) : undefined;
          return (
            <li key={step.key} className="flex gap-3 py-2" aria-current={state === "active" ? "step" : undefined}>
              <StepIcon state={state} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span
                    className={`text-sm leading-snug ${
                      state === "pending" ? "text-ink-faint" : state === "failed" ? "font-medium text-bad-800" : state === "active" ? "font-medium text-ink" : "text-ink"
                    }`}
                  >
                    {step.label}
                    <span className="sr-only">{{ done: ", done", active: ", in progress", failed: ", failed", pending: ", waiting" }[state]}</span>
                  </span>
                  {ms !== undefined && <span className="shrink-0 text-xs tabular-nums text-ink-muted">{stepDuration(ms)}</span>}
                </div>
                {detail && <p className={`mt-0.5 text-[13px] leading-snug ${state === "done" ? "text-ink-muted" : "text-gold-700"}`}>{detail}</p>}
                {state === "failed" && (
                  <div role="alert" className="mt-2 flex flex-col items-start gap-2.5 rounded-control border border-bad-200 bg-bad-50 px-3 py-2.5">
                    <p className="text-[13px] leading-relaxed text-bad-800">{run.failed!.message}</p>
                    <Button variant="danger" size="sm" disabled={retryDisabled} onClick={onRetry} icon={<ArrowClockwise size={15} weight="bold" aria-hidden />}>
                      Try again
                    </Button>
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StepIcon({ state }: { state: "done" | "active" | "failed" | "pending" }) {
  return (
    <span className="grid size-5 shrink-0 place-items-center pt-px" aria-hidden>
      {state === "done" && <CheckCircle size={20} weight="fill" className="text-ok-600" />}
      {state === "failed" && <WarningCircle size={20} weight="fill" className="text-bad-700" />}
      {state === "active" && <Spinner className="size-4 text-gold-600" />}
      {state === "pending" && <span className="size-3.5 rounded-full border-2 border-line-strong" />}
    </span>
  );
}

function Elapsed({ startedAt, endedAt }: { startedAt: number; endedAt?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(timer);
  }, [endedAt]);
  const seconds = Math.max(0, ((endedAt ?? now) - startedAt) / 1000);
  return (
    <span role="timer" className="inline-block min-w-[3.5ch] font-medium tabular-nums text-ink-2">
      {seconds.toFixed(1)} s
    </span>
  );
}

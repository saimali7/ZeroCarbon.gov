"use client";

import { Check, Sparkle } from "@phosphor-icons/react";
import type { DocumentKind, SubmissionDetail, SubmissionDocument } from "@zerocarbon/shared";
import { useEffect, useMemo, useState } from "react";
import { Button, Spinner } from "../../../_components/ui/button";
import { Card } from "../../../_components/ui/card";
import { FileTypeIcon } from "../../../_components/ui/evidence";
import { ErrorState } from "../../../_components/ui/states";
import { KIND_LABEL } from "./b-kinds";

const STEPS = [
  { title: "Read the documents", detail: "Workbook, PDFs and CSV evidence turned into facts" },
  { title: "Check against the Climate Law and EAD guidance", detail: "Decree-Law No. 11 of 2024 and the EAD MRV Technical Guidance" },
  { title: "Recalculate every source stream", detail: "Activity data, emission factors, methane lines and totals" },
  { title: "Compare with peers and last year", detail: "Intensity benchmark and year-on-year trend" },
  { title: "Cross-check satellite methane", detail: "Simulated detections matched against the site logs" },
];
const STEP_MS = 450;

type Props = { detail: SubmissionDetail; running: boolean; error?: string; onRunReview: () => void };

/** Shown before the first review and while a review runs: what the AI does, then live progress. */
export function RunReviewPanel(props: Props) {
  return props.running ? <Running {...props} /> : <PanelLayout {...props} active={-1} />;
}

/** Mounted only while running, so the timer restarts from zero on every run. */
function Running(props: Props) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const id = window.setInterval(() => setElapsed(performance.now() - start), 100);
    return () => window.clearInterval(id);
  }, []);
  return <PanelLayout {...props} active={Math.min(Math.floor(elapsed / STEP_MS), STEPS.length - 1)} elapsed={elapsed} />;
}

function PanelLayout({ detail, running, error, onRunReview, active, elapsed = 0 }: Props & { active: number; elapsed?: number }) {
  const count = detail.documents.length;
  return (
    <Card aria-labelledby="run-review-title" className="overflow-hidden">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="p-5 sm:p-6">
          <h2 id="run-review-title" className="text-base font-semibold leading-snug">
            {running ? "Reviewing the submission" : "Run the AI review"}
          </h2>
          {running ? (
            <p className="mt-1 flex items-center gap-2 text-[15px] font-medium text-ink">
              <Spinner className="size-4 text-gold-600" />
              Reviewing, <span className="tabular-nums">{(elapsed / 1000).toFixed(1)} s</span>
            </p>
          ) : (
            <p className="mt-1 max-w-[62ch] text-sm leading-relaxed text-ink-muted">
              The AI reads the {count === 1 ? "submitted document" : `${count} submitted documents`} and checks the report in five steps. You make the decision.
            </p>
          )}
          <p aria-live="polite" className="sr-only">
            {running ? `Step ${active + 1} of ${STEPS.length}: ${STEPS[active].title}` : ""}
          </p>
          {error && !running && <ErrorState className="mt-4" title="The review could not be completed" message={error} onRetry={onRunReview} />}
          <ol className="mt-5 flex flex-col">
            {STEPS.map((step, i) => (
              <Step key={step.title} index={i} title={step.title} detail={step.detail} state={active < 0 ? "idle" : i < active ? "done" : i === active ? "active" : "pending"} />
            ))}
          </ol>
          {!running && (
            <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button size="lg" icon={<Sparkle size={18} weight="bold" aria-hidden />} onClick={onRunReview}>
                Run AI review
              </Button>
              <span className="text-[13px] text-ink-muted">Results stay internal until you record a decision.</span>
            </div>
          )}
        </div>
        <aside aria-label="Documents the AI will read" className="border-t border-line bg-sunken p-5 sm:p-6 lg:border-l lg:border-t-0">
          <DocumentsToRead documents={detail.documents} running={running} read={active > 0} />
        </aside>
      </div>
    </Card>
  );
}

type StepState = "idle" | "pending" | "active" | "done";

function Step({ index, title, detail, state }: { index: number; title: string; detail: string; state: StepState }) {
  const mark = {
    idle: "border border-line-strong bg-surface text-ink-muted",
    pending: "border border-line bg-surface text-ink-faint",
    active: "border-2 border-gold-500 bg-gold-50",
    done: "bg-ok-600 text-white",
  }[state];
  const label = { idle: "", pending: ", pending", active: ", in progress", done: ", done" }[state];
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {index < STEPS.length - 1 && (
        <span aria-hidden className={`absolute bottom-0.5 left-[13px] top-8 w-px transition-colors duration-300 ${state === "done" ? "bg-ok-200" : "bg-line"}`} />
      )}
      <span aria-hidden className={`relative grid size-7 shrink-0 place-items-center rounded-full text-[13px] font-semibold tabular-nums transition-colors duration-200 ${mark}`}>
        {state === "done" ? (
          <Check size={14} weight="bold" />
        ) : state === "active" ? (
          <span className="size-2 animate-pulse rounded-full bg-gold-500 motion-reduce:animate-none" />
        ) : (
          index + 1
        )}
      </span>
      <div className="min-w-0 pt-0.5">
        <p className={`text-[15px] leading-snug transition-colors duration-200 ${state === "pending" ? "text-ink-muted" : "text-ink"} ${state === "active" ? "font-semibold" : "font-medium"}`}>
          {title}
          <span className="sr-only">{label}</span>
        </p>
        <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">{detail}</p>
      </div>
    </li>
  );
}

function DocumentsToRead({ documents, running, read }: { documents: SubmissionDocument[]; running: boolean; read: boolean }) {
  const groups = useMemo(() => {
    const order = Object.keys(KIND_LABEL) as DocumentKind[];
    const byKind = new Map<DocumentKind, SubmissionDocument[]>();
    for (const d of documents) byKind.set(d.kind, [...(byKind.get(d.kind) ?? []), d]);
    return [...byKind.entries()].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
  }, [documents]);

  return (
    <>
      <h3 className="text-sm font-semibold">
        {documents.length === 1 ? "1 document" : `${documents.length} documents`} to read
      </h3>
      <p className="mt-0.5 text-[13px] text-ink-muted">From the submitted package, by type</p>
      {groups.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">No documents in this submission.</p>
      ) : (
        <ul className="mt-3 flex flex-col">
          {groups.map(([kind, docs]) => (
            <li key={kind} className="flex items-center gap-2.5 border-t border-line-soft py-2 text-sm first:border-t-0">
              <FileTypeIcon fileName={docs[0].fileName} size={16} />
              <span className="min-w-0 flex-1 truncate text-ink-2">{KIND_LABEL[kind]}</span>
              <span className="tabular-nums text-ink-muted">{docs.length}</span>
              {running && (
                <span className="grid size-3.5 place-items-center">
                  {read && <Check size={14} weight="bold" aria-label="Read" className="text-ok-600" />}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

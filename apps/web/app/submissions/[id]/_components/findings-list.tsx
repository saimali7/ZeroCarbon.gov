"use client";

import { CaretRight, CheckCircle, Sparkle } from "@phosphor-icons/react";
import type { EvidenceRef, Finding, FindingOutcome, Review, Severity } from "@zerocarbon/shared";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Card, CardHeader } from "../../../_components/ui/card";
import { EvidenceChip } from "../../../_components/ui/evidence";
import { Tonnes } from "../../../_components/ui/figures";
import { OutcomePill, SeverityPill } from "../../../_components/ui/pill";
import { RuleChips } from "../../../_components/ui/rules";
import { Segmented } from "../../../_components/ui/segmented";
import { CATEGORY_LABEL } from "../../../_lib/format";
import { metricRows } from "./b-metrics";

type Filter = "all" | FindingOutcome;

const OUTCOMES: FindingOutcome[] = ["breach", "clarification", "signal"];
const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];
const GROUP_TITLE: Record<FindingOutcome, string> = { breach: "Rule breaches", clarification: "Needs clarification", signal: "Signals to investigate" };
const FILTER_LABEL: Record<Filter, string> = { all: "All", breach: "Rule breaches", clarification: "Needs clarification", signal: "Signals" };

type Props = { review: Review; onOpenEvidence: (ref: EvidenceRef) => void };

/** Findings grouped by outcome and sorted by severity, each a disclosure row with explanation, figures and evidence. */
export function FindingsList(props: Props) {
  return <FindingsCard key={props.review.id} {...props} />;
}

function FindingsCard({ review, onOpenEvidence }: Props) {
  const sorted = useMemo(
    () =>
      [...review.findings].sort(
        (a, b) => OUTCOMES.indexOf(a.outcome) - OUTCOMES.indexOf(b.outcome) || SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity),
      ),
    [review.findings],
  );
  const counts: Record<Filter, number> = {
    all: sorted.length,
    breach: sorted.filter((f) => f.outcome === "breach").length,
    clarification: sorted.filter((f) => f.outcome === "clarification").length,
    signal: sorted.filter((f) => f.outcome === "signal").length,
  };
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(sorted.filter((f) => f.outcome === "breach").slice(0, 2).map((f) => f.id)),
  );
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Links to "#finding-F-03" from other panels: show the finding, expand it and move focus to it.
  useEffect(() => {
    const reveal = () => {
      const id = decodeURIComponent(window.location.hash).replace(/^#finding-/, "");
      if (!sorted.some((f) => f.id === id)) return;
      setFilter("all");
      setOpen((prev) => new Set(prev).add(id));
      requestAnimationFrame(() => {
        const row = document.getElementById(`finding-${id}`);
        row?.scrollIntoView({ block: "start", behavior: "smooth" });
        row?.querySelector("button")?.focus({ preventScroll: true });
      });
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, [sorted]);

  const groups = filter === "all" ? OUTCOMES.filter((o) => counts[o] > 0) : [filter];
  const aiLabel = review.narrativeSource === "template" ? "Plain-language explanation" : "AI explanation";

  return (
    <Card aria-labelledby="findings-title">
      <CardHeader
        id="findings-title"
        title={
          <>
            Findings <span className="ml-1 font-normal tabular-nums text-ink-muted">{sorted.length}</span>
          </>
        }
        description={sorted.length > 0 ? "Grouped by outcome, most severe first. Open a finding for the explanation, figures and evidence." : undefined}
      />
      {sorted.length === 0 ? (
        <div className="flex items-start gap-3 px-5 py-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ok-50 text-ok-600">
            <CheckCircle size={20} weight="duotone" aria-hidden />
          </span>
          <div>
            <p className="font-semibold text-ok-700">No findings</p>
            <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">Every check passed and nothing needs follow-up. The checks list shows what was verified.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto px-5 pb-1 pt-4">
            <Segmented<Filter>
              size="sm"
              label="Filter findings by outcome"
              value={filter}
              onChange={setFilter}
              options={(["all", ...OUTCOMES] as Filter[]).map((value) => ({
                value,
                ariaLabel: `${FILTER_LABEL[value]}, ${counts[value]}`,
                label: (
                  <>
                    {FILTER_LABEL[value]}
                    <span className="tabular-nums text-ink-muted">{counts[value]}</span>
                  </>
                ),
              }))}
            />
          </div>
          {groups.map((outcome) => {
            const items = sorted.filter((f) => f.outcome === outcome);
            return (
              <section key={outcome} aria-labelledby={`findings-group-${outcome}`} className="mt-3 last:pb-1">
                <h3 id={`findings-group-${outcome}`} className="flex items-center gap-2 border-y border-line-soft bg-sunken px-5 py-2 text-[13px] font-semibold text-ink-2">
                  {GROUP_TITLE[outcome]}
                  <span className="font-normal tabular-nums text-ink-muted">{items.length}</span>
                </h3>
                {items.length === 0 ? (
                  <p className="px-5 py-5 text-sm text-ink-muted">No findings in this group.</p>
                ) : (
                  <ul>
                    {items.map((f) => (
                      <FindingRow key={f.id} finding={f} open={open.has(f.id)} onToggle={() => toggle(f.id)} onOpenEvidence={onOpenEvidence} aiLabel={aiLabel} />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </>
      )}
    </Card>
  );
}

function FindingRow({
  finding,
  open,
  onToggle,
  onOpenEvidence,
  aiLabel,
}: {
  finding: Finding;
  open: boolean;
  onToggle: () => void;
  onOpenEvidence: (ref: EvidenceRef) => void;
  aiLabel: string;
}) {
  const panelId = `finding-panel-${finding.id}`;
  const impact = finding.impact && finding.impact.tco2e !== 0 ? finding.impact : undefined;
  const metrics = metricRows(finding.metrics);
  return (
    <li id={`finding-${finding.id}`} className="scroll-mt-6 border-b border-line-soft last:border-b-0">
      <h4>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="grid min-h-8 w-full grid-cols-[16px_minmax(0,1fr)] gap-x-3 px-5 py-4 text-left transition-colors duration-150 hover:bg-sunken sm:grid-cols-[16px_minmax(0,1fr)_auto] sm:gap-x-4"
        >
          <CaretRight size={16} weight="bold" aria-hidden className={`mt-0.5 text-ink-muted transition-transform duration-200 ${open ? "rotate-90" : ""}`} />
          <span className="min-w-0">
            <span className="block text-[15px] font-medium leading-snug text-ink">
              <span className="mr-2 font-mono text-xs font-normal text-ink-muted">{finding.id}</span>
              {finding.title}
            </span>
            <span className="mt-2 flex flex-wrap items-center gap-1.5">
              <SeverityPill severity={finding.severity} />
              <OutcomePill outcome={finding.outcome} />
              <span className="ml-0.5 text-[13px] text-ink-muted">{CATEGORY_LABEL[finding.category]}</span>
            </span>
          </span>
          {impact && (
            <span className="col-start-2 mt-2.5 flex flex-col sm:col-start-3 sm:row-start-1 sm:mt-0 sm:items-end sm:text-right">
              <Tonnes value={impact.tco2e} className="text-[15px] font-semibold text-ink" />
              <span className="text-xs text-ink-muted">{impact.countsTowardTotal ? "Counts toward total" : "Not added to total"}</span>
            </span>
          )}
        </button>
      </h4>
      <div id={panelId} hidden={!open} className="flex flex-col gap-4 pb-5 pl-5 pr-5 sm:pl-[52px]">
        <p className="text-[15px] font-medium leading-relaxed text-ink text-pretty">{finding.summary}</p>
        {finding.explanation && (
          <div className="rounded-control border-l-2 border-gold-300 bg-gold-50 px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-gold-800">
              <Sparkle size={13} weight="fill" aria-hidden />
              {aiLabel}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink-2 text-pretty">{finding.explanation}</p>
          </div>
        )}
        {finding.details.length > 0 && (
          <Block title="Supporting facts">
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-ink-2 marker:text-gold-500">
              {finding.details.map((d, i) => (
                <li key={i}>{d}</li>
              ))}
            </ul>
          </Block>
        )}
        {(metrics.length > 0 || finding.impact) && (
          <Block title="Key figures">
            {metrics.length > 0 && (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 rounded-control border border-line-soft bg-sunken p-3 xl:grid-cols-3">
                {metrics.map((m) => (
                  <div key={m.key} className="min-w-0">
                    <dt className="text-xs text-ink-muted">{m.label}</dt>
                    <dd className="text-sm font-medium tabular-nums text-ink [overflow-wrap:anywhere]">{m.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {finding.impact && (
              <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
                <span className="font-medium text-ink-2">Impact basis:</span> {finding.impact.basis}
              </p>
            )}
          </Block>
        )}
        {finding.evidence.length > 0 && (
          <Block title="Evidence">
            <div className="flex flex-wrap gap-1.5">
              {finding.evidence.map((e, i) => (
                <EvidenceChip key={`${e.documentId}-${i}`} evidence={e} onOpen={onOpenEvidence} />
              ))}
            </div>
          </Block>
        )}
        {finding.ruleIds.length > 0 && (
          <Block title="Rules">
            <RuleChips ruleIds={finding.ruleIds} />
          </Block>
        )}
      </div>
    </li>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h5 className="mb-1.5 text-[13px] font-medium text-ink-muted">{title}</h5>
      {children}
    </div>
  );
}

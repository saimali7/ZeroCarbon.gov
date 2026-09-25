"use client";

import { CheckCircle, MinusCircle, Warning, WarningOctagon, XCircle, type Icon } from "@phosphor-icons/react";
import type { CheckStatus, Review } from "@zerocarbon/shared";
import type { MouseEvent } from "react";
import { Card, CardHeader } from "../../../_components/ui/card";
import { Pill } from "../../../_components/ui/pill";
import { CATEGORY_LABEL } from "../../../_lib/format";

const STATUS: Record<CheckStatus, { icon: Icon; className: string; label: string }> = {
  pass: { icon: CheckCircle, className: "text-ok-600", label: "Passed" },
  fail: { icon: XCircle, className: "text-bad-500", label: "Failed" },
  warning: { icon: Warning, className: "text-gold-500", label: "Warning" },
  not_applicable: { icon: MinusCircle, className: "text-ink-faint", label: "Not applicable" },
  error: { icon: WarningOctagon, className: "text-bad-700", label: "Could not run" },
};

/** Every check the review ran, with its result and links to the findings it produced. */
export function ChecksList({ review }: { review: Review }) {
  const checks = review.checks;
  const count = (s: CheckStatus) => checks.filter((c) => c.status === s).length;
  const tally: { status: CheckStatus; tone: "bad" | "gold" | "neutral"; text: string }[] = [
    { status: "fail", tone: "bad", text: "failed" },
    { status: "warning", tone: "gold", text: count("warning") === 1 ? "warning" : "warnings" },
    { status: "error", tone: "bad", text: "could not run" },
    { status: "not_applicable", tone: "neutral", text: "not applicable" },
  ];

  return (
    <Card aria-labelledby="checks-title">
      <CardHeader
        id="checks-title"
        title="Checks run"
        description={checks.length === 0 ? "No checks were recorded for this review." : `${count("pass")} of ${checks.length} checks passed`}
        actions={
          checks.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1.5">
              {tally
                .filter((t) => count(t.status) > 0)
                .map((t) => (
                  <Pill key={t.status} size="sm" tone={t.tone}>
                    {count(t.status)} {t.text}
                  </Pill>
                ))}
            </div>
          )
        }
      />
      {checks.length > 0 && (
        <ul className="grid gap-x-8 px-5 py-2 md:grid-cols-2">
          {checks.map((c) => {
            const s = STATUS[c.status];
            return (
              <li key={c.checkId} className="flex gap-3 border-t border-line-soft py-3 first:border-t-0 md:[&:nth-child(2)]:border-t-0">
                <s.icon size={20} weight="fill" aria-hidden className={`mt-px shrink-0 ${s.className}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-snug text-ink">
                    <span className="sr-only">{s.label}: </span>
                    {c.title}
                  </p>
                  <p className="text-xs text-ink-muted">{CATEGORY_LABEL[c.category]}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{c.message}</p>
                  {c.findingIds.length > 0 && (
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-1 gap-y-1 text-[13px]">
                      <span className="mr-0.5 text-ink-muted">See finding</span>
                      {c.findingIds.map((id) => (
                        <a
                          key={id}
                          href={`#finding-${id}`}
                          onClick={(e) => revealAgain(e, id)}
                          className="-my-1.5 inline-flex h-8 items-center rounded-sm px-1 font-mono text-xs font-medium text-gold-700 underline decoration-gold-300 underline-offset-2 hover:decoration-gold-700"
                        >
                          {id}
                        </a>
                      ))}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Clicking a link whose hash is already current fires no hashchange; re-dispatch it so the finding opens again. */
function revealAgain(e: MouseEvent<HTMLAnchorElement>, id: string) {
  if (window.location.hash !== `#finding-${id}`) return;
  e.preventDefault();
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

"use client";

import {
  ArrowCounterClockwise,
  CheckCircle,
  EnvelopeSimple,
  Gavel,
  MagnifyingGlass,
  PencilSimple,
  SealCheck,
  Tray,
  WarningCircle,
  type Icon,
} from "@phosphor-icons/react";
import type { AuditEventType } from "@zerocarbon/shared";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { auditActor, auditMessage } from "../../../audit/_components/audit-text";
import { api } from "../../../_lib/api";
import { formatDateTime } from "../../../_lib/format";
import { useResource } from "../../../_lib/use-resource";
import { Button } from "../../../_components/ui/button";
import { Card, CardHeader } from "../../../_components/ui/card";
import { ErrorState, Skeleton } from "../../../_components/ui/states";

const LIMIT = 6;

const EVENT: Record<AuditEventType, { icon: Icon; tone: string }> = {
  submission_received: { icon: Tray, tone: "bg-line-soft text-ink-2" },
  review_started: { icon: MagnifyingGlass, tone: "bg-line-soft text-ink-2" },
  review_completed: { icon: CheckCircle, tone: "bg-ok-100 text-ok-700" },
  review_failed: { icon: WarningCircle, tone: "bg-bad-100 text-bad-700" },
  decision_recorded: { icon: Gavel, tone: "bg-gold-100 text-gold-800" },
  letter_drafted: { icon: EnvelopeSimple, tone: "bg-line-soft text-ink-2" },
  letter_updated: { icon: PencilSimple, tone: "bg-line-soft text-ink-2" },
  letter_approved: { icon: SealCheck, tone: "bg-ok-100 text-ok-700" },
  demo_reset: { icon: ArrowCounterClockwise, tone: "bg-line-soft text-ink-2" },
};

/** Audit trail for one submission, newest first. Reloads whenever `refreshKey` changes. */
export function ActivityPanel({ submissionId, refreshKey }: { submissionId: string; refreshKey: number }) {
  const listId = useId();
  const audit = useResource((signal) => api.audit(submissionId, signal), [submissionId, refreshKey]);
  const [showAll, setShowAll] = useState(false);
  const events = useMemo(() => [...(audit.data ?? [])].reverse().sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [audit.data]);
  const visible = showAll ? events : events.slice(0, LIMIT);

  return (
    <Card>
      <CardHeader
        title="Activity"
        actions={
          <Link href="/audit" className="inline-flex min-h-8 items-center rounded-sm text-[13px] font-medium text-gold-700 hover:underline">
            Audit log
          </Link>
        }
      />
      <div className="px-5 py-4">
        {audit.status === "loading" ? (
          <ActivitySkeleton />
        ) : audit.status === "error" && !audit.data ? (
          <ErrorState title="Activity could not be loaded" message={audit.error} onRetry={() => void audit.reload()} />
        ) : events.length === 0 ? (
          <p className="text-[14px] text-ink-muted">No activity yet.</p>
        ) : (
          <>
            <ol id={listId} className="flex flex-col">
              {visible.map((e, i) => {
                const { icon: EventIcon, tone } = EVENT[e.type] ?? EVENT.submission_received;
                return (
                  <li key={e.id} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < visible.length - 1 && <span aria-hidden className="absolute bottom-0 start-[13.5px] top-8 w-px bg-line" />}
                    <span className={`grid size-7 shrink-0 place-items-center rounded-full ${tone}`}>
                      <EventIcon size={14} weight="bold" aria-hidden />
                    </span>
                    <div className="min-w-0 pt-0.5">
                      <p className="break-words text-[14px] leading-snug text-ink">{auditMessage(e.message)}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">
                        {auditActor(e.actor)} · <time dateTime={e.createdAt}>{formatDateTime(e.createdAt)}</time>
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
            {events.length > LIMIT && (
              <Button variant="ghost" size="sm" aria-expanded={showAll} aria-controls={listId} onClick={() => setShowAll((s) => !s)} className="-ms-3 mt-3">
                {showAll ? "Show fewer" : `Show all ${events.length}`}
              </Button>
            )}
            {audit.status === "error" && (
              <p role="alert" className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-bad-800">
                Could not refresh the activity.
                <button type="button" onClick={() => void audit.reload()} className="min-h-8 rounded-sm font-medium underline underline-offset-2">
                  Try again
                </button>
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function ActivitySkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-4">
      <span className="sr-only">Loading activity</span>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex gap-3">
          <Skeleton className="size-7 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5 pt-1">
            <Skeleton className="h-3.5 w-[85%]" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

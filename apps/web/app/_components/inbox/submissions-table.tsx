"use client";

import { CaretRight, CheckCircle } from "@phosphor-icons/react";
import type { SubmissionSummary } from "@zerocarbon/shared";
import Link from "next/link";
import type { ReactNode } from "react";
import { DECISION_DONE_LABEL, formatDateShort, formatInt } from "../../_lib/format";
import { Spinner } from "../ui/button";
import { Tonnes } from "../ui/figures";
import { Pill, StagePill, StatusPill } from "../ui/pill";
import { RiskRing } from "../ui/risk-ring";
import { Skeleton } from "../ui/states";
import { isReviewed } from "./queue-model";

const href = (s: SubmissionSummary) => `/submissions/${encodeURIComponent(s.id)}`;

/** Covers the whole row or card so it is clickable; the focus ring is drawn on the overlay. */
const stretched =
  "after:absolute after:inset-0 after:rounded-[inherit] focus-visible:outline-none! focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-gold-500";

const th = "px-3 py-2.5 text-[13px] font-medium text-ink-muted first:pl-5 last:pr-5";
const td = "px-3 py-3.5 align-middle first:pl-5 last:pr-5";

/** Desktop table (768px and up). Every row opens the submission. */
export function SubmissionsTable({ rows }: { rows: SubmissionSummary[] }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-[980px] border-collapse text-left text-sm">
        <caption className="sr-only">Submissions, highest risk first. Select a row to open the review.</caption>
        <thead className="border-b border-line bg-sunken">
          <tr>
            <th scope="col" className={`${th} w-16`}>
              Risk
            </th>
            <th scope="col" className={th}>
              Facility
            </th>
            <th scope="col" className={th}>
              Submitted
            </th>
            <th scope="col" className={`${th} text-right`}>
              Reported emissions
            </th>
            <th scope="col" className={th}>
              Status
            </th>
            <th scope="col" className={`${th} text-right`}>
              Findings
            </th>
            <th scope="col" className={`${th} text-right`}>
              Est. under-reporting
            </th>
            <th scope="col" className={th}>
              Decision
            </th>
            <th scope="col" className={`${th} w-10`}>
              <span className="sr-only">Open</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((s) => (
            <tr key={s.id} className="group relative transition-colors duration-150 hover:bg-gold-50">
              <td className={td}>
                <RiskCell s={s} />
              </td>
              <td className={`${td} max-w-[300px]`}>
                <FacilityCell s={s} />
              </td>
              <td className={`${td} whitespace-nowrap tabular-nums text-ink-2`}>{formatDateShort(s.submittedOn)}</td>
              <td className={`${td} whitespace-nowrap text-right`}>
                <Tonnes value={s.reportedTotalTco2e} />
              </td>
              <td className={td}>
                <StatusCell s={s} />
              </td>
              <td className={`${td} text-right tabular-nums`}>
                <Findings s={s} />
              </td>
              <td className={`${td} whitespace-nowrap text-right`}>
                <UnderReporting s={s} />
              </td>
              <td className={td}>
                <DecisionCell s={s} />
              </td>
              <td className={`${td} text-ink-faint transition-colors group-hover:text-gold-700`}>
                <CaretRight size={16} weight="bold" aria-hidden />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Stacked rows for small screens (below 768px). */
export function SubmissionCards({ rows }: { rows: SubmissionSummary[] }) {
  return (
    <ul className="divide-y divide-line md:hidden">
      {rows.map((s) => (
        <li key={s.id} className="relative px-4 py-4 transition-colors duration-150 hover:bg-gold-50">
          <div className="flex items-start gap-3">
            <RiskCell s={s} />
            <div className="min-w-0 flex-1">
              <FacilityCell s={s} />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusCell s={s} />
            {s.decision && <DecisionCell s={s} />}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
            <Field label="Reported emissions">
              <Tonnes value={s.reportedTotalTco2e} />
            </Field>
            <Field label="Est. under-reporting">
              <UnderReporting s={s} />
            </Field>
            <Field label="Submitted">{formatDateShort(s.submittedOn)}</Field>
            <Field label="Findings">
              <Findings s={s} />
            </Field>
          </dl>
        </li>
      ))}
    </ul>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums text-ink">{children}</dd>
    </div>
  );
}

function RiskCell({ s }: { s: SubmissionSummary }) {
  if (s.riskScore !== undefined && s.stage !== "reviewing") return <RiskRing score={s.riskScore} band={s.riskBand} size="sm" />;
  const label = s.stage === "reviewing" ? "Review in progress" : "Not reviewed, no risk score yet";
  return (
    <span
      role="img"
      aria-label={label}
      className="grid size-10 shrink-0 place-items-center rounded-full border-[2.5px] border-dashed border-line-strong text-[13px] text-ink-faint"
    >
      {s.stage === "reviewing" ? <Spinner className="size-4 text-gold-600" /> : "-"}
    </span>
  );
}

function FacilityCell({ s }: { s: SubmissionSummary }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <Link href={href(s)} className={`truncate text-[15px] font-semibold text-ink ${stretched}`} title={s.facilityName}>
          {s.facilityShortName}
        </Link>
        {s.source === "upload" && (
          <Pill size="sm" className="shrink-0">
            Uploaded
          </Pill>
        )}
      </div>
      <p className="mt-0.5 truncate text-[13px] text-ink-muted">
        {s.operator} · <span className="font-mono text-xs text-ink-2">{s.eadId}</span>
      </p>
    </div>
  );
}

function StatusCell({ s }: { s: SubmissionSummary }) {
  if (s.status && s.stage !== "reviewing" && s.stage !== "failed") return <StatusPill status={s.status} size="sm" />;
  return <StagePill stage={s.stage} size="sm" />;
}

function Findings({ s }: { s: SubmissionSummary }) {
  if (!isReviewed(s) || s.findingCount === undefined) return <span className="text-ink-faint">-</span>;
  return <span className={s.findingCount === 0 ? "text-ink-muted" : "font-medium text-ink"}>{formatInt(s.findingCount)}</span>;
}

function UnderReporting({ s }: { s: SubmissionSummary }) {
  const value = s.estimatedUnderReportingTco2e;
  if (!isReviewed(s) || value === undefined) return <span className="text-ink-faint">-</span>;
  if (value <= 0) return <span className="font-normal text-ink-muted">None found</span>;
  return <Tonnes value={value} className="font-semibold text-bad-700" />;
}

function DecisionCell({ s }: { s: SubmissionSummary }) {
  if (!s.decision) return <span className="text-ink-faint">-</span>;
  return (
    <Pill size="sm" tone={s.decision === "approve" ? "ok" : "neutral"} icon={<CheckCircle size={13} weight="bold" aria-hidden />}>
      {DECISION_DONE_LABEL[s.decision]}
    </Pill>
  );
}

/** Placeholder rows shaped like the table (desktop) and the stacked rows (mobile). */
export function QueueSkeleton({ rows = 3 }: { rows?: number }) {
  const list = Array.from({ length: rows }, (_, i) => i);
  return (
    <div aria-busy="true" aria-label="Loading submissions">
      <div className="hidden md:block">
        <div className="h-10 border-b border-line bg-sunken" />
        {list.map((i) => (
          <div key={i} className="flex items-center gap-6 border-b border-line px-5 py-3.5 last:border-b-0">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex w-64 flex-col gap-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-56" />
            </div>
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="ml-auto h-3.5 w-28" />
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-3.5 w-8" />
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
      <div className="divide-y divide-line md:hidden">
        {list.map((i) => (
          <div key={i} className="flex flex-col gap-3 px-4 py-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
            <Skeleton className="h-5 w-28 rounded-full" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { CalendarBlank, CheckCircle, EnvelopeSimple, Sparkle, UserCheck, Warning } from "@phosphor-icons/react";
import type { Decision, DecisionAction, DecisionResponse, Letter, Review, SubmissionDetail } from "@zerocarbon/shared";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { api } from "../../../_lib/api";
import { DECISION_DONE_LABEL, DECISION_LABEL, formatDateTime } from "../../../_lib/format";
import { OFFICER } from "../../../_lib/officer";
import { Button } from "../../../_components/ui/button";
import { Card, CardHeader } from "../../../_components/ui/card";
import { Pill } from "../../../_components/ui/pill";
import { RuleChip } from "../../../_components/ui/rules";
import { Notice } from "../../../_components/ui/states";

type Props = {
  detail: SubmissionDetail;
  review: Review;
  onDecided: (res: DecisionResponse) => void | Promise<void>;
  onOpenLetter: (letterId: string) => void;
};

const ACTIONS: DecisionAction[] = ["approve", "request_clarification", "escalate_inspection", "refer_penalty"];

const errorText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

/** The officer's decision: AI recommendation, the four actions, and the recorded outcome with its letter. */
export function DecisionPanel({ detail, review, onDecided, onOpenLetter }: Props) {
  const latest = detail.decisions.reduce<Decision | undefined>((a, d) => (!a || d.createdAt > a.createdAt ? d : a), undefined);
  const [changing, setChanging] = useState(false);
  const showForm = !latest || changing;

  return (
    <Card>
      <CardHeader
        title="Your decision"
        description={showForm ? "Review the findings, then record the outcome." : "Recorded in the audit log."}
      />
      {showForm ? (
        <DecisionForm
          detail={detail}
          review={review}
          initial={latest?.action ?? review.recommendedAction.primary}
          onCancel={latest ? () => setChanging(false) : undefined}
          onDecided={async (res) => {
            await onDecided(res);
            setChanging(false);
          }}
        />
      ) : (
        <DecisionRecord detail={detail} review={review} decision={latest} onDecided={onDecided} onOpenLetter={onOpenLetter} onChange={() => setChanging(true)} />
      )}
      <p className="flex items-center gap-2 border-t border-line px-5 py-3 text-[13px] text-ink-muted">
        <UserCheck size={16} weight="duotone" aria-hidden className="shrink-0 text-gold-700" />
        Human decision. The AI only recommends.
      </p>
    </Card>
  );
}

function Recommendation({ review }: { review: Review }) {
  const rec = review.recommendedAction;
  const [expanded, setExpanded] = useState(false);
  const long = rec.rationale.length > 150;
  return (
    <div className="rounded-field border border-line bg-sunken px-4 py-3.5">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gold-700">
        <Sparkle size={14} weight="duotone" aria-hidden />
        AI recommendation
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <p className="text-base font-semibold leading-snug">{DECISION_LABEL[rec.primary]}</p>
        <Pill tone="gold" size="sm">
          Recommended
        </Pill>
      </div>
      <p className={`mt-1.5 text-[13px] leading-relaxed text-ink-2 ${expanded ? "" : "line-clamp-3"}`}>{rec.rationale}</p>
      {long && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
          className="mt-0.5 inline-flex min-h-8 items-center rounded-sm text-[13px] font-medium text-gold-700 hover:underline"
        >
          {expanded ? "Show less" : "Read full rationale"}
        </button>
      )}
      {rec.responseDays !== undefined && (
        <p className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-muted">
          <CalendarBlank size={15} weight="bold" aria-hidden className="shrink-0" />
          Response deadline: {rec.responseDays} days from the letter date
        </p>
      )}
    </div>
  );
}

function consequence(action: DecisionAction, responseDays?: number): ReactNode {
  switch (action) {
    case "approve":
      return "Accept the report as submitted and close the review. An acceptance letter is drafted.";
    case "request_clarification":
      return responseDays !== undefined
        ? `Send a query. The operator must correct the report within ${responseDays} days.`
        : "Send a query. The operator must correct and resubmit the report.";
    case "escalate_inspection":
      return "Notify the operator of a site inspection to verify the reported data.";
    case "refer_penalty":
      return "Refer the breaches for administrative fines under Art. 15.";
  }
}

function DecisionForm({
  detail,
  review,
  initial,
  onCancel,
  onDecided,
}: {
  detail: SubmissionDetail;
  review: Review;
  initial: DecisionAction;
  onCancel?: () => void;
  onDecided: (res: DecisionResponse) => Promise<void>;
}) {
  const id = useId();
  const rec = review.recommendedAction;
  const [action, setAction] = useState<DecisionAction>(initial);
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const breaches = review.findings.filter((f) => f.outcome === "breach").length;
  const needsConfirm = action === "approve" && breaches > 0;
  const blocked = needsConfirm && !confirmed;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (blocked || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const res = await api.decide(detail.id, { action, officerName: OFFICER.name, note: note.trim() || undefined, draftLetter: true });
      await onDecided(res);
    } catch (err) {
      setError(errorText(err, "The decision could not be recorded."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5 px-5 py-4">
      <Recommendation review={review} />

      <fieldset className="flex flex-col gap-2" disabled={busy}>
        <legend className="mb-2 text-[13px] font-semibold text-ink-2">Choose an action</legend>
        {ACTIONS.map((a) => {
          const inputId = `${id}-${a}`;
          return (
            <div
              key={a}
              className="relative flex gap-3 rounded-field border border-line bg-surface px-3.5 py-3 transition-colors hover:border-line-strong has-checked:border-gold-500 has-checked:bg-gold-50"
            >
              <input
                type="radio"
                id={inputId}
                name={`${id}-action`}
                value={a}
                checked={action === a}
                onChange={() => setAction(a)}
                aria-describedby={`${inputId}-desc`}
                className="mt-0.5 size-4 shrink-0 accent-gold-600"
              />
              <div className="flex min-w-0 flex-col gap-1">
                <label htmlFor={inputId} className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-medium leading-snug after:absolute after:inset-0 after:rounded-field">
                  {DECISION_LABEL[a]}
                  {a === rec.primary && (
                    <Pill tone="gold" size="sm">
                      Recommended
                    </Pill>
                  )}
                  {a !== rec.primary && rec.alsoConsider.includes(a) && <Pill size="sm">Also consider</Pill>}
                </label>
                <p id={`${inputId}-desc`} className="text-[13px] leading-relaxed text-ink-muted">
                  {consequence(a, rec.responseDays)}
                </p>
                {a === "refer_penalty" && (
                  <div className="relative z-10 mt-0.5">
                    <RuleChip ruleId="DL11-2024-ART15" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </fieldset>

      {needsConfirm && (
        <div className="flex flex-col gap-2">
          <Notice tone="gold" className="flex items-start gap-2">
            <Warning size={18} weight="bold" aria-hidden className="mt-0.5 shrink-0 text-gold-700" />
            <span>
              The AI found {breaches} rule {breaches === 1 ? "breach" : "breaches"}. Approving closes the review without a query.
            </span>
          </Notice>
          <label className="flex min-h-8 cursor-pointer items-start gap-2.5 text-[14px] leading-snug">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              disabled={busy}
              className="mt-0.5 size-4 shrink-0 accent-gold-600"
            />
            I have reviewed the breaches and still want to approve this report.
          </label>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-note`} className="text-[13px] font-semibold text-ink-2">
          Note for the record <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <textarea
          id={`${id}-note`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
          rows={3}
          maxLength={1000}
          className="w-full resize-y rounded-field border border-line-strong bg-surface px-3 py-2 text-[14px] leading-relaxed transition-colors hover:border-ink-faint focus:border-gold-500 disabled:bg-sunken"
        />
      </div>

      {error && (
        <div role="alert">
          <Notice tone="bad">{error}</Notice>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Button type="submit" size="lg" busy={busy} disabled={blocked} className="w-full">
          Record decision and draft letter
        </Button>
        <p aria-live="polite" className="text-center text-[12.5px] text-ink-muted empty:hidden">
          {busy ? "Recording the decision and drafting the letter in English and Arabic." : ""}
        </p>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} disabled={busy} className="w-full">
            Keep current decision
          </Button>
        )}
      </div>
    </form>
  );
}

function letterFor(detail: SubmissionDetail, decision: Decision): Letter | undefined {
  const byId = decision.letterId ? detail.letters.find((l) => l.id === decision.letterId) : undefined;
  if (byId) return byId;
  return detail.letters
    .filter((l) => l.action === decision.action && l.createdAt >= decision.createdAt)
    .reduce<Letter | undefined>((a, l) => (!a || l.createdAt > a.createdAt ? l : a), undefined);
}

function DecisionRecord({
  detail,
  review,
  decision,
  onDecided,
  onOpenLetter,
  onChange,
}: {
  detail: SubmissionDetail;
  review: Review;
  decision: Decision;
  onDecided: Props["onDecided"];
  onOpenLetter: Props["onOpenLetter"];
  onChange: () => void;
}) {
  const letter = letterFor(detail, decision);
  const recommended = review.recommendedAction.primary;
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string>();

  const draftLetter = async () => {
    setDrafting(true);
    setError(undefined);
    try {
      const created = await api.draftLetter(detail.id, decision.action);
      await onDecided({ decision, letter: created });
      onOpenLetter(created.id);
    } catch (err) {
      setError(errorText(err, "The letter could not be drafted."));
    } finally {
      setDrafting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-ok-100 text-ok-700">
          <CheckCircle size={20} weight="bold" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-base font-semibold leading-snug">{DECISION_DONE_LABEL[decision.action]}</p>
          <p className="mt-0.5 text-[13px] text-ink-muted">
            {decision.officerName} · <time dateTime={decision.createdAt}>{formatDateTime(decision.createdAt)}</time>
          </p>
        </div>
      </div>

      <p className="text-[13px] leading-relaxed text-ink-muted">
        {decision.action === recommended ? "In line with the AI recommendation." : `Differs from the AI recommendation (${DECISION_LABEL[recommended]}).`}
      </p>

      {decision.note && (
        <blockquote className="whitespace-pre-line break-words rounded-control border-s-2 border-line-strong bg-sunken px-3 py-2 text-[14px] leading-relaxed text-ink-2">
          {decision.note}
        </blockquote>
      )}

      <div className="flex flex-col gap-3 rounded-field border border-line px-3.5 py-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-[14px] font-semibold">
            <EnvelopeSimple size={16} weight="bold" aria-hidden className="text-ink-muted" />
            Letter to the operator
          </h3>
          {letter && (
            <Pill size="sm" tone={letter.status === "approved" ? "ok" : "gold"}>
              {letter.status === "approved" ? "Approved" : "Draft"}
            </Pill>
          )}
        </div>
        {letter ? (
          <>
            <p className="truncate font-mono text-[12px] text-ink-muted" title={letter.reference}>
              {letter.reference}
            </p>
            <Button className="w-full" icon={<EnvelopeSimple size={16} weight="bold" />} onClick={() => onOpenLetter(letter.id)}>
              Open letter
            </Button>
          </>
        ) : (
          <>
            <p className="text-[13px] leading-relaxed text-ink-muted">No letter has been drafted for this decision yet.</p>
            <Button className="w-full" busy={drafting} onClick={() => void draftLetter()}>
              Draft letter
            </Button>
          </>
        )}
        {error && (
          <div role="alert">
            <Notice tone="bad">{error}</Notice>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onChange}
        className="inline-flex min-h-8 items-center self-start rounded-sm text-[13px] font-medium text-gold-700 hover:underline"
      >
        Change decision
      </button>
    </div>
  );
}

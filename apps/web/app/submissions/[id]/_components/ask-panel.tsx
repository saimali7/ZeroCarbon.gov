"use client";

import { Database, Sparkle } from "@phosphor-icons/react";
import type { AskResponse, EvidenceRef } from "@zerocarbon/shared";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { api } from "../../../_lib/api";
import { Button } from "../../../_components/ui/button";
import { Card, CardHeader } from "../../../_components/ui/card";
import { EvidenceChip } from "../../../_components/ui/evidence";
import { RuleChips } from "../../../_components/ui/rules";
import { Skeleton } from "../../../_components/ui/states";

const SUGGESTIONS = {
  issues: ["Why is the flare data flagged?", "Which methane sources are missing?", "What did the verifier conclude?", "What should the query letter ask for?"],
  compliant: ["Why is this report compliant?", "Was the satellite detection explained?", "How does it compare with peers?", "What did the verifier conclude?"],
};

/** Offline answers repeat their evidence and rules inline; drop that tail when the same citations are shown as chips. */
function withoutInlineCitations(paragraph: string, answer: AskResponse): string {
  let text = paragraph;
  const cut = (marker: string) => {
    const i = text.indexOf(marker);
    if (i > 0) text = text.slice(0, i).trimEnd();
  };
  if (answer.citations.length > 0) cut(" Evidence: ");
  if (answer.ruleIds.length > 0) cut(" Rules: ");
  return text;
}

type Turn = { id: number; question: string } & (
  | { status: "loading" }
  | { status: "done"; answer: AskResponse }
  | { status: "error"; error: string }
);

/** Question and answer thread grounded in the submission, with evidence and rule citations. */
export function AskPanel({
  submissionId,
  compliant = false,
  onOpenEvidence,
}: {
  submissionId: string;
  /** Picks suggested questions that fit a clean report instead of one with findings. */
  compliant?: boolean;
  onOpenEvidence: (ref: EvidenceRef) => void;
}) {
  const inputId = useId();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [threadFor, setThreadFor] = useState(submissionId);
  if (threadFor !== submissionId) {
    setThreadFor(submissionId);
    setTurns([]);
  }
  const [input, setInput] = useState("");
  const nextId = useRef(0);
  const controllers = useRef(new Set<AbortController>());
  const logRef = useRef<HTMLDivElement>(null);
  const pending = turns.some((t) => t.status === "loading");
  const asked = new Set(turns.map((t) => t.question));
  const suggestions = SUGGESTIONS[compliant ? "compliant" : "issues"].filter((q) => !asked.has(q));

  useEffect(() => {
    const active = controllers.current;
    return () => active.forEach((c) => c.abort());
  }, []);

  // Keep the newest question at the top of the thread so its answer reads from the start.
  useEffect(() => {
    const log = logRef.current;
    const last = log?.lastElementChild as HTMLElement | null;
    if (log && last) log.scrollTop = last.offsetTop - 12;
  }, [turns]);

  const ask = async (question: string, retryId?: number) => {
    const q = question.trim();
    if (!q || pending) return;
    const id = retryId ?? ++nextId.current;
    setTurns((ts) =>
      retryId === undefined ? [...ts, { id, question: q, status: "loading" }] : ts.map((t) => (t.id === id ? { id, question: q, status: "loading" } : t)),
    );
    if (retryId === undefined) setInput("");
    const controller = new AbortController();
    controllers.current.add(controller);
    try {
      const answer = await api.ask(submissionId, q, controller.signal);
      setTurns((ts) => ts.map((t) => (t.id === id ? { id, question: q, status: "done", answer } : t)));
    } catch (err) {
      if (controller.signal.aborted) return;
      const error = err instanceof Error ? err.message : "The question could not be answered.";
      setTurns((ts) => ts.map((t) => (t.id === id ? { id, question: q, status: "error", error } : t)));
    } finally {
      controllers.current.delete(controller);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(input);
  };

  return (
    <Card>
      <CardHeader title="Ask about this report" description="Answers cite the submitted documents and the rules." />
      <div
        ref={logRef}
        role="log"
        aria-label="Questions and answers"
        className={`relative flex max-h-[520px] flex-col gap-5 overflow-y-auto overscroll-contain ${turns.length ? "border-b border-line px-5 py-4" : ""}`}
      >
        {turns.map((t) => (
          <TurnView key={t.id} turn={t} onOpenEvidence={onOpenEvidence} onRetry={() => void ask(t.question, t.id)} retryDisabled={pending} />
        ))}
      </div>

      <div className="flex flex-col gap-4 px-5 py-4">
        {suggestions.length > 0 && (
          <div className="flex flex-col gap-2">
            <p id={`${inputId}-suggest`} className="text-[13px] font-semibold text-ink-2">
              Suggested questions
            </p>
            <ul aria-labelledby={`${inputId}-suggest`} className="flex flex-wrap gap-1.5">
              {suggestions.map((q) => (
                <li key={q} className="max-w-full">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => void ask(q)}
                    className="min-h-8 max-w-full rounded-full border border-line bg-surface px-3 py-1 text-left text-[13px] leading-snug text-ink-2 transition-colors hover:border-gold-300 hover:bg-gold-50 hover:text-ink disabled:opacity-45"
                  >
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={submit} className="flex flex-col gap-1.5">
          <label htmlFor={inputId} className="text-[13px] font-semibold text-ink-2">
            Your question
          </label>
          <div className="flex gap-2">
            <input
              id={inputId}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              maxLength={500}
              autoComplete="off"
              className="h-10 min-w-0 flex-1 rounded-field border border-line-strong bg-surface px-3 text-[14px] transition-colors hover:border-ink-faint focus:border-gold-500"
            />
            <Button type="submit" busy={pending} disabled={!input.trim()}>
              Ask
            </Button>
          </div>
        </form>
      </div>
    </Card>
  );
}

function TurnView({
  turn,
  onOpenEvidence,
  onRetry,
  retryDisabled,
}: {
  turn: Turn;
  onOpenEvidence: (ref: EvidenceRef) => void;
  onRetry: () => void;
  retryDisabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="max-w-[90%] self-end break-words rounded-card rounded-br-sm border border-gold-200 bg-gold-50 px-3 py-2 text-[14px] leading-snug text-ink">
        <span className="sr-only">Question: </span>
        {turn.question}
      </p>
      <div className="rounded-card rounded-bl-sm border border-line bg-sunken px-3.5 py-3">
        {turn.status === "loading" && (
          <div aria-busy className="flex flex-col gap-2 py-0.5">
            <span className="sr-only">Finding the answer.</span>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-[92%]" />
            <Skeleton className="h-3 w-[70%]" />
          </div>
        )}
        {turn.status === "error" && (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p className="text-[14px] leading-relaxed text-bad-800">{turn.error}</p>
            <Button variant="danger" size="sm" onClick={onRetry} disabled={retryDisabled}>
              Try again
            </Button>
          </div>
        )}
        {turn.status === "done" && <Answer answer={turn.answer} onOpenEvidence={onOpenEvidence} />}
      </div>
    </div>
  );
}

function Answer({ answer, onOpenEvidence }: { answer: AskResponse; onOpenEvidence: (ref: EvidenceRef) => void }) {
  const paragraphs = answer.answer
    .split(/\n\s*\n/)
    .map((p) => (answer.source === "offline" ? withoutInlineCitations(p.trim(), answer) : p.trim()))
    .filter(Boolean);
  return (
    <div className="flex flex-col gap-3">
      <span className="sr-only">Answer: </span>
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-line break-words text-[14px] leading-relaxed text-ink">
          {p}
        </p>
      ))}
      {answer.citations.length > 0 && (
        <div className="flex flex-col items-start gap-1.5">
          <p className="text-xs font-semibold text-ink-muted">Sources</p>
          {answer.citations.map((c, i) => (
            <EvidenceChip key={`${c.documentId}-${i}`} evidence={c} onOpen={onOpenEvidence} />
          ))}
        </div>
      )}
      <RuleChips ruleIds={answer.ruleIds} />
      <p className="flex items-center gap-1.5 text-xs text-ink-muted">
        {answer.source === "llm" ? (
          <>
            <Sparkle size={14} weight="duotone" aria-hidden className="text-gold-700" />
            AI answer{answer.model ? ` · ${answer.model}` : ""}
          </>
        ) : (
          <>
            <Database size={14} weight="duotone" aria-hidden />
            Offline answer from the review
          </>
        )}
      </p>
    </div>
  );
}

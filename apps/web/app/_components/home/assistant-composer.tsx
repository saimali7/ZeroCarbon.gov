"use client";

import { ArrowUp, ChatCircleText, FolderOpen, FolderSimplePlus, Files, Paperclip, Play } from "@phosphor-icons/react";
import { useEffect, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { Button, Spinner } from "../ui/button";
import { Skeleton } from "../ui/states";

export interface Sample {
  id: string;
  name: string;
}

export const QUESTION_CHIPS = ["How much is under-reported?", "What should I ask the operator?"];

/** Large drop area shown before the first run. The whole card accepts drops; this is the visible target. */
export function DropZone({ disabled, onPickFolder, onPickFiles }: { disabled: boolean; onPickFolder: () => void; onPickFiles: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-[14px] border-2 border-dashed border-gold-300 bg-gold-50/40 px-5 py-7 text-center sm:py-9">
      <span className="grid size-12 place-items-center rounded-full bg-gold-100 text-gold-700">
        <FolderSimplePlus size={24} weight="duotone" aria-hidden />
      </span>
      <div>
        <p className="text-base font-semibold">Drop a submission folder</p>
        <p className="mt-1 max-w-[46ch] text-[13px] leading-relaxed text-ink-muted">
          The folder must include the EAD MRV emissions report workbook (.xlsx). PDFs and the evidence/ subfolder are read with it.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="secondary" disabled={disabled} onClick={onPickFolder} icon={<FolderOpen size={18} aria-hidden />}>
          Choose a folder
        </Button>
        <Button variant="ghost" disabled={disabled} onClick={onPickFiles} icon={<Files size={18} aria-hidden />}>
          Choose files
        </Button>
      </div>
    </div>
  );
}

const chipClass =
  "inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border px-3 py-1 text-left text-[13px] font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50";

/** Sample runs (demo safety net) and follow-up questions. */
export function SuggestionChips({
  samples,
  loadingSample,
  runBusy,
  questions,
  askBusy,
  onSample,
  onQuestion,
}: {
  samples: Sample[] | "loading" | "error";
  loadingSample?: string;
  runBusy: boolean;
  questions: string[];
  askBusy: boolean;
  onSample: (sample: Sample) => void;
  onQuestion: (question: string) => void;
}) {
  const hasSamples = Array.isArray(samples) && samples.length > 0;
  if (!hasSamples && samples !== "loading" && questions.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <ul className="flex flex-wrap gap-2" aria-label="Suggestions">
        {questions.map((q) => (
          <li key={q} className="max-w-full">
            <button type="button" disabled={askBusy} onClick={() => onQuestion(q)} className={`${chipClass} border-line bg-surface text-ink-2 hover:border-gold-300 hover:bg-gold-50`}>
              <ChatCircleText size={15} aria-hidden className="shrink-0 text-gold-700" />
              {q}
            </button>
          </li>
        ))}
        {samples === "loading" && (
          <li aria-hidden className="flex gap-2">
            <Skeleton className="h-8 w-56 rounded-full" />
            <Skeleton className="h-8 w-52 rounded-full" />
          </li>
        )}
        {hasSamples &&
          samples.map((s) => (
            <li key={s.id} className="max-w-full">
              <button
                type="button"
                data-sample={s.id}
                disabled={runBusy}
                aria-busy={loadingSample === s.id || undefined}
                onClick={() => onSample(s)}
                className={`${chipClass} border-gold-200 bg-gold-50 text-gold-800 hover:border-gold-300 hover:bg-gold-100`}
              >
                {loadingSample === s.id ? <Spinner className="size-3.5" /> : <Play size={14} weight="fill" aria-hidden className="shrink-0" />}
                <span className="truncate">Run a sample: {s.name}</span>
              </button>
            </li>
          ))}
      </ul>
      {hasSamples && runBusy && <p className="text-xs text-ink-muted">Samples and new folders are available when the current review finishes.</p>}
    </div>
  );
}

/** Grows the textarea with its content up to the max height. */
function fit(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
}

/** ChatGPT-style composer: attach, a textarea (Enter sends, Shift+Enter adds a line) and send. */
export function Composer({
  value,
  onChange,
  onSend,
  sending,
  attachDisabled,
  onPickFolder,
  onPickFiles,
  inputRef,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  attachDisabled: boolean;
  onPickFolder: () => void;
  onPickFiles: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  placeholder: string;
}) {
  const canSend = value.trim().length > 0 && !sending;
  useEffect(() => {
    if (!value && inputRef.current) inputRef.current.style.height = "";
  }, [value, inputRef]);
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSend) onSend();
    }
  };
  const attachTitle = attachDisabled ? "Available when the current review finishes" : undefined;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSend) onSend();
      }}
      className="flex items-end gap-1 rounded-[16px] border border-line-strong bg-surface p-1.5 shadow-raised transition-colors focus-within:border-gold-500"
    >
      <label htmlFor="assistant-input" className="sr-only">
        Message the review assistant
      </label>
      <div className="flex shrink-0">
        <IconButton label="Attach a submission folder" title={attachTitle} disabled={attachDisabled} onClick={onPickFolder}>
          <Paperclip size={19} aria-hidden />
        </IconButton>
        <IconButton label="Attach files" title={attachTitle} disabled={attachDisabled} onClick={onPickFiles} className="max-sm:hidden">
          <Files size={19} aria-hidden />
        </IconButton>
      </div>
      <textarea
        id="assistant-input"
        ref={inputRef}
        rows={1}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          fit(e.target);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className="block h-10 max-h-40 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-2 text-[15px] leading-6 text-ink outline-none placeholder:text-ink-faint focus-visible:outline-none"
      />
      <button
        type="submit"
        disabled={!canSend}
        aria-label="Send"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-gold-600 text-white transition-colors duration-150 hover:bg-gold-700 disabled:bg-line disabled:text-ink-faint"
      >
        {sending ? <Spinner className="size-4" /> : <ArrowUp size={18} weight="bold" aria-hidden />}
      </button>
    </form>
  );
}

function IconButton({
  label,
  title,
  disabled,
  onClick,
  className = "",
  children,
}: {
  label: string;
  title?: string;
  disabled: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-10 place-items-center rounded-full text-ink-muted transition-colors duration-150 hover:bg-line-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
    >
      {children}
    </button>
  );
}

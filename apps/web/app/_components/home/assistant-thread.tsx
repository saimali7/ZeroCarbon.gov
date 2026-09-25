"use client";

import { WarningCircle } from "@phosphor-icons/react";
import type { AskResponse } from "@zerocarbon/shared";
import type { ReactNode } from "react";
import { formatBytes, formatInt } from "../../_lib/format";
import { OFFICER } from "../../_lib/officer";
import { Button, Spinner } from "../ui/button";
import { EvidenceChip, FileTypeIcon } from "../ui/evidence";
import { RuleChips } from "../ui/rules";
import { BrandMark } from "../shell/brand-mark";
import { orderForDisplay, totalBytes } from "./assistant-model";
import type { PickedFile } from "../inbox/collect-files";

const FILES_SHOWN = 5;

export function AssistantAvatar({ size = 32 }: { size?: number }) {
  return (
    <span className="grid shrink-0 place-items-center rounded-full bg-surface ring-1 ring-gold-200" style={{ width: size, height: size }}>
      <BrandMark size={size - 6} />
    </span>
  );
}

/** Assistant turn: avatar on the left (above on small screens), content without a bubble so cards can use the full width. */
export function AssistantTurn({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
      <div className="flex items-center gap-2 sm:items-start">
        <span className="sm:hidden">
          <AssistantAvatar size={26} />
        </span>
        <span className="max-sm:hidden">
          <AssistantAvatar />
        </span>
        <span className="text-xs text-ink-muted sm:sr-only">Assistant</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:pt-1">{children}</div>
    </div>
  );
}

export function OfficerTurn({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="flex max-w-[min(100%,34rem)] flex-col items-end gap-1">
        <span className="text-xs text-ink-muted">{OFFICER.firstName}</span>
        <div className="rounded-[14px] rounded-tr-[4px] border border-gold-200 bg-gold-50 px-3.5 py-2.5 text-[15px] leading-relaxed text-ink">{children}</div>
      </div>
    </div>
  );
}

/** What the officer dropped: folder name, count, size and the first few files. */
export function FilesMessage({ label, files }: { label: string; files: PickedFile[] }) {
  const shown = orderForDisplay(files).slice(0, FILES_SHOWN);
  const more = files.length - shown.length;
  return (
    <OfficerTurn>
      <p className="break-words font-medium">{label}</p>
      <p className="text-[13px] text-ink-muted">
        {formatInt(files.length)} {files.length === 1 ? "file" : "files"}, {formatBytes(totalBytes(files))}
      </p>
      {shown.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 border-t border-gold-200 pt-2">
          {shown.map((f) => (
            <li key={f.relativePath} className="flex min-w-0 items-center gap-2 text-[13px]">
              <FileTypeIcon fileName={f.relativePath} size={15} />
              <span className="min-w-0 truncate text-ink-2" title={f.relativePath}>
                {f.relativePath}
              </span>
            </li>
          ))}
          {more > 0 && (
            <li className="pl-[23px] text-[13px] text-ink-muted">
              and {formatInt(more)} more {more === 1 ? "file" : "files"}
            </li>
          )}
        </ul>
      )}
    </OfficerTurn>
  );
}

export function NoticeMessage({ title, text }: { title: string; text: string }) {
  return (
    <AssistantTurn>
      <div role="alert" className="flex gap-2.5 rounded-card border border-bad-200 bg-bad-50 px-4 py-3">
        <WarningCircle size={20} weight="fill" className="mt-px shrink-0 text-bad-700" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-bad-800">{title}</p>
          <p className="mt-0.5 text-sm leading-relaxed text-ink-2">{text}</p>
        </div>
      </div>
    </AssistantTurn>
  );
}

export function Paragraphs({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2.5 text-[15px] leading-relaxed text-ink">
      {text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} className="whitespace-pre-line">
            {p}
          </p>
        ))}
    </div>
  );
}

export function AnswerMessage({
  status,
  response,
  text,
  facility,
  onRetry,
}: {
  status: "loading" | "ready" | "error" | "local";
  response?: AskResponse;
  text?: string;
  facility?: string;
  onRetry: () => void;
}) {
  if (status === "loading")
    return (
      <AssistantTurn>
        <p className="flex items-center gap-2 text-sm text-ink-muted">
          <Spinner className="size-3.5 text-gold-600" />
          Looking through {facility ? `the ${facility} submission` : "the submission"}
        </p>
      </AssistantTurn>
    );
  if (status === "error")
    return (
      <AssistantTurn>
        <div role="alert" className="flex flex-col items-start gap-2.5 rounded-card border border-bad-200 bg-bad-50 px-4 py-3">
          <p className="text-sm leading-relaxed text-bad-800">I could not answer that: {text}</p>
          <Button variant="danger" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      </AssistantTurn>
    );
  if (status === "local" || !response) return <AssistantTurn>{text && <Paragraphs text={text} />}</AssistantTurn>;
  return (
    <AssistantTurn>
      {facility && <p className="text-xs font-medium text-gold-700">About {facility}</p>}
      <Paragraphs text={response.answer} />
      {response.citations.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-ink-muted">Sources</p>
          <div className="flex flex-wrap gap-1.5">
            {response.citations.map((c, i) => (
              <EvidenceChip key={`${c.documentId}-${c.locator}-${i}`} evidence={c} />
            ))}
          </div>
        </div>
      )}
      <RuleChips ruleIds={response.ruleIds} />
    </AssistantTurn>
  );
}

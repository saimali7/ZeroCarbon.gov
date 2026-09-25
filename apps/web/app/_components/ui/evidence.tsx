"use client";

import { FileCsv, FilePdf, FileXls, File as FileIcon } from "@phosphor-icons/react";
import type { EvidenceRef } from "@zerocarbon/shared";

export function FileTypeIcon({ fileName, size = 16 }: { fileName: string; size?: number }) {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return <FilePdf size={size} weight="duotone" aria-hidden className="text-bad-700" />;
  if (ext === "xlsx" || ext === "xls") return <FileXls size={size} weight="duotone" aria-hidden className="text-ok-700" />;
  if (ext === "csv") return <FileCsv size={size} weight="duotone" aria-hidden className="text-gold-700" />;
  return <FileIcon size={size} weight="duotone" aria-hidden className="text-ink-muted" />;
}

/** "DEC-SDF-CPF2_Flare-Log_Daily_2025.csv" → "Flare Log Daily 2025.csv" */
export function shortFileName(fileName: string) {
  return fileName.replace(/^[A-Z]{2,5}-[A-Z0-9]{2,5}-[A-Z0-9]{2,6}_/, "").replace(/[-_]/g, " ");
}

/** Clickable reference to the exact place in a submitted file. */
export function EvidenceChip({ evidence, onOpen, className = "" }: { evidence: EvidenceRef; onOpen?: (ref: EvidenceRef) => void; className?: string }) {
  const content = (
    <>
      <FileTypeIcon fileName={evidence.fileName} size={15} />
      <span className="min-w-0 truncate">
        <span className="font-medium text-ink">{shortFileName(evidence.fileName)}</span>
        <span className="text-ink-muted"> · {evidence.locator}</span>
      </span>
    </>
  );
  const base = `inline-flex max-w-full items-center gap-1.5 rounded-control border border-line bg-surface px-2.5 py-1 text-left text-[13px] ${className}`;
  if (!onOpen) return <span className={base}>{content}</span>;
  return (
    <button
      type="button"
      onClick={() => onOpen(evidence)}
      title={`${evidence.fileName}, ${evidence.locator}`}
      className={`${base} transition-colors hover:border-gold-300 hover:bg-gold-50`}
    >
      {content}
    </button>
  );
}

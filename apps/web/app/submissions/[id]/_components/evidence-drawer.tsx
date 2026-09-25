"use client";

import { ArrowSquareOut, DownloadSimple } from "@phosphor-icons/react";
import type { DocumentTextResponse, EvidenceRef, SubmissionDocument } from "@zerocarbon/shared";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { buttonClass } from "../../../_components/ui/button";
import { Dialog } from "../../../_components/ui/dialog";
import { FileTypeIcon, shortFileName } from "../../../_components/ui/evidence";
import { ErrorState } from "../../../_components/ui/states";
import { api } from "../../../_lib/api";
import { CitedText, DocumentSkeleton, DocumentView, ViewFrame } from "./b-document-views";
import { documentLabel, viewKindFor } from "./b-kinds";

type Props = { submissionId: string; documents: SubmissionDocument[]; evidence: EvidenceRef | null; onClose: () => void };

/** Side drawer that opens a cited file at the exact page, rows or sheet, with the quote highlighted. */
export function EvidenceDrawer({ submissionId, documents, evidence, onClose }: Props) {
  const titleId = useId();
  const doc = evidence ? documents.find((d) => d.id === evidence.documentId) : undefined;
  const text = useDocumentText(submissionId, evidence?.documentId);
  const url = evidence ? api.documentUrl(submissionId, evidence.documentId) : "";

  return (
    <Dialog
      open={evidence !== null}
      onClose={onClose}
      variant="drawer"
      size="xl"
      labelledBy={titleId}
      title={
        evidence ? (
          <span className="flex min-w-0 items-center gap-2">
            <FileTypeIcon fileName={evidence.fileName} size={20} />
            <span className="truncate" title={evidence.fileName}>
              {shortFileName(evidence.fileName)}
            </span>
          </span>
        ) : (
          "Evidence"
        )
      }
      description={evidence && `${documentLabel(evidence, doc)} · ${evidence.locator}`}
      actions={
        evidence && (
          <>
            <a href={url} target="_blank" rel="noreferrer" aria-label="Open original (new tab)" className={buttonClass("secondary", "sm")}>
              <ArrowSquareOut size={15} weight="bold" aria-hidden />
              <span className="hidden sm:inline">Open original</span>
            </a>
            <a href={url} download={evidence.fileName} aria-label={`Download ${evidence.fileName}`} title="Download" className={buttonClass("ghost", "sm", "w-9 px-0")}>
              <DownloadSimple size={17} weight="bold" aria-hidden />
            </a>
          </>
        )
      }
    >
      {evidence &&
        (text.status === "ready" ? (
          <DocumentView
            key={[evidence.documentId, evidence.page, evidence.rows, evidence.sheet, evidence.quote].join("|")}
            view={viewKindFor(evidence.fileName, doc)}
            data={text.data}
            evidence={evidence}
          />
        ) : (
          <ViewFrame top={evidence.quote && <CitedText quote={evidence.quote} />}>
            {text.status === "loading" ? (
              <div aria-busy>
                <span className="sr-only" role="status">
                  Loading document
                </span>
                <DocumentSkeleton view={viewKindFor(evidence.fileName, doc)} />
              </div>
            ) : (
              <div className="p-5 sm:px-6">
                <ErrorState title="This document could not be loaded" message={text.error} onRetry={text.retry} />
              </div>
            )}
          </ViewFrame>
        ))}
    </Dialog>
  );
}

type TextState = { status: "loading"; retry: () => void } | { status: "ready"; data: DocumentTextResponse; retry: () => void } | { status: "error"; error: string; retry: () => void };

/** Loads a document's text once per document; later opens come straight from the in-memory cache. */
function useDocumentText(submissionId: string, documentId: string | undefined): TextState {
  const cache = useRef(new Map<string, DocumentTextResponse>());
  const [result, setResult] = useState<{ key: string; data?: DocumentTextResponse; error?: string }>();
  const [attempt, setAttempt] = useState(0);
  const key = documentId ? `${submissionId}/${documentId}` : "";

  useEffect(() => {
    if (!documentId || cache.current.has(key)) return;
    const controller = new AbortController();
    api
      .documentText(submissionId, documentId, controller.signal)
      .then((data) => {
        cache.current.set(key, data);
        setResult({ key, data });
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error: err instanceof Error ? err.message : "The document could not be loaded." });
      });
    return () => controller.abort();
  }, [submissionId, documentId, key, attempt]);

  const retry = useCallback(() => {
    setResult(undefined);
    setAttempt((n) => n + 1);
  }, []);

  const cached = key ? cache.current.get(key) : undefined;
  if (cached) return { status: "ready", data: cached, retry };
  if (result?.key === key && result.error) return { status: "error", error: result.error, retry };
  return { status: "loading", retry };
}

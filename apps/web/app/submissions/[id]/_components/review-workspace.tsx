"use client";

import { CaretRight } from "@phosphor-icons/react";
import type { DecisionResponse, EvidenceRef, Letter } from "@zerocarbon/shared";
import Link from "next/link";
import { useCallback, useState } from "react";
import { api } from "../../../_lib/api";
import { useResource } from "../../../_lib/use-resource";
import { ErrorState, Skeleton } from "../../../_components/ui/states";
import { ActivityPanel } from "./activity-panel";
import { AskPanel } from "./ask-panel";
import { BenchmarkPanel } from "./benchmark-panel";
import { ChecksList } from "./checks-list";
import { DecisionPanel } from "./decision-panel";
import { DocumentsPanel } from "./documents-panel";
import { EvidenceDrawer } from "./evidence-drawer";
import { FindingsList } from "./findings-list";
import { FlareBalanceChart } from "./flare-balance-chart";
import { LetterDialog } from "./letter-dialog";
import { ReviewHeader } from "./review-header";
import { ReviewSummary } from "./review-summary";
import { RunReviewPanel } from "./run-review-panel";
import { SatellitePanel } from "./satellite-panel";

/**
 * Officer review screen for one submission. Owns data loading and cross-panel
 * state (running a review, the evidence drawer, the letter dialog); every panel
 * receives what it needs through props.
 */
export function ReviewWorkspace({ id }: { id: string }) {
  const detail = useResource((signal) => api.submission(id, signal), [id]);
  const reference = useResource((signal) => api.reference(signal), []);

  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string>();
  const [evidence, setEvidence] = useState<EvidenceRef | null>(null);
  const [letterId, setLetterId] = useState<string | null>(null);
  const [activityKey, setActivityKey] = useState(0);

  const runReview = useCallback(async () => {
    setRunning(true);
    setRunError(undefined);
    try {
      await api.review(id);
      await detail.reload();
      setActivityKey((k) => k + 1);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "The review could not be completed.");
    } finally {
      setRunning(false);
    }
  }, [id, detail]);

  const onDecided = useCallback(
    async (res: DecisionResponse) => {
      await detail.reload();
      setActivityKey((k) => k + 1);
      if (res.letter) setLetterId(res.letter.id);
    },
    [detail],
  );

  const onLetterSaved = useCallback(
    (letter: Letter) => {
      detail.setData((prev) =>
        prev ? { ...prev, letters: prev.letters.some((l) => l.id === letter.id) ? prev.letters.map((l) => (l.id === letter.id ? letter : l)) : [...prev.letters, letter] } : prev!,
      );
      setActivityKey((k) => k + 1);
    },
    [detail],
  );

  if (detail.status === "loading") return <WorkspaceSkeleton />;
  if (!detail.data) {
    return (
      <div className="flex flex-col gap-6">
        <Breadcrumb current="Submission" />
        <ErrorState title="This submission could not be loaded" message={detail.error ?? "Unknown error"} onRetry={() => void detail.reload()} />
      </div>
    );
  }

  const data = detail.data;
  const review = data.review;
  const letter = data.letters.find((l) => l.id === letterId) ?? null;
  const openDocument = (documentId: string) => {
    const doc = data.documents.find((d) => d.id === documentId);
    if (doc) setEvidence({ documentId: doc.id, fileName: doc.fileName, locator: "Whole document" });
  };

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb current={data.facilityShortName} />
      <ReviewHeader detail={data} running={running} onRunReview={runReview} />

      {(!review || running) && <RunReviewPanel detail={data} running={running} error={runError} onRunReview={runReview} />}

      {review && !running && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-6">
            <ReviewSummary detail={data} review={review} />
            <FindingsList review={review} onOpenEvidence={setEvidence} />
            <FlareBalanceChart detail={data} review={review} onOpenEvidence={setEvidence} />
            <BenchmarkPanel detail={data} review={review} reference={reference.data} />
            <SatellitePanel detail={data} review={review} reference={reference.data} onOpenEvidence={setEvidence} />
            <ChecksList review={review} />
            <DocumentsPanel detail={data} onOpenDocument={openDocument} />
          </div>
          <aside aria-label="Decision and tools" className="flex flex-col gap-6 lg:sticky lg:top-6">
            <DecisionPanel detail={data} review={review} onDecided={onDecided} onOpenLetter={setLetterId} />
            <AskPanel submissionId={data.id} onOpenEvidence={setEvidence} />
            <ActivityPanel submissionId={data.id} refreshKey={activityKey} />
          </aside>
        </div>
      )}

      <EvidenceDrawer submissionId={data.id} documents={data.documents} evidence={evidence} onClose={() => setEvidence(null)} />
      <LetterDialog detail={data} letter={letter} open={letter !== null} onClose={() => setLetterId(null)} onSaved={onLetterSaved} />
    </div>
  );
}

function Breadcrumb({ current }: { current: string }) {
  return (
    <nav aria-label="Breadcrumb" className="text-[13px]">
      <ol className="flex items-center gap-1.5 text-ink-muted">
        <li>
          <Link href="/" className="rounded-sm font-medium text-gold-700 hover:underline">
            Review queue
          </Link>
        </li>
        <li aria-hidden>
          <CaretRight size={12} weight="bold" />
        </li>
        <li aria-current="page" className="truncate text-ink">
          {current}
        </li>
      </ol>
    </nav>
  );
}

function WorkspaceSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-6">
      <Skeleton className="h-4 w-48" />
      <div className="flex flex-wrap items-center justify-between gap-6 rounded-card border border-line bg-surface p-6">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-7 w-96 max-w-full" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="size-32 rounded-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-40 w-full rounded-card" />
          <Skeleton className="h-64 w-full rounded-card" />
        </div>
        <Skeleton className="h-80 w-full rounded-card" />
      </div>
    </div>
  );
}

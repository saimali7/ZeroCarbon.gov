import type { AskResponse, PipelineStage, Review, SubmissionSummary } from "@zerocarbon/shared";
import { DECISION_LABEL, STATUS_LABEL, formatDuration, formatInt } from "../../_lib/format";
import type { ActiveRun } from "../../_lib/runs";
import { isWorkbook, mergeFiles, type PickedFile } from "../inbox/collect-files";

/** On-screen pace of the progress report, so each step is readable even though the real work takes well under a second. */
export const STEP_MS = 850;

export type StepKey = "upload" | PipelineStage["name"];

export interface StepDef {
  key: StepKey;
  label: string;
  /** Shown while the step is running. */
  hint: string;
}

export function stepsFor(fileCount: number): StepDef[] {
  return [
    { key: "upload", label: `Upload ${formatInt(fileCount)} ${fileCount === 1 ? "file" : "files"}`, hint: "Sending the package to the review service" },
    { key: "ingest", label: "Read the emissions report and supporting documents", hint: "EAD MRV workbook, PDF documents and CSV evidence" },
    { key: "extract", label: "Extract facts from the PDFs", hint: "Calibration certificates, gas analysis, verification statement, monitoring plan" },
    { key: "checks", label: "Run compliance checks against the Climate Law and EAD guidance", hint: "Completeness, calculations, evidence, methane and verification" },
    { key: "score", label: "Score risk and compare with peers and last year", hint: "Peer intensity benchmark and prior-year trend" },
    { key: "narrative", label: "Write the summary and recommended action", hint: "Plain-language summary with legal citations" },
  ];
}

export const STEP_COUNT = 6;

export interface RunItem {
  kind: "run";
  id: string;
  label: string;
  files: PickedFile[];
  startedAt: number;
  endedAt?: number;
  /** Number of steps shown as done (0 to STEP_COUNT). */
  done: number;
  upload?: SubmissionSummary;
  uploadMs?: number;
  review?: Review;
  failed?: { step: number; message: string };
}

export type ThreadItem =
  | { kind: "files"; id: string; label: string; files: PickedFile[] }
  | { kind: "notice"; id: string; title: string; text: string }
  | RunItem
  | { kind: "question"; id: string; text: string }
  | {
      kind: "answer";
      id: string;
      question: string;
      submissionId?: string;
      facility?: string;
      status: "loading" | "ready" | "error" | "local";
      response?: AskResponse;
      text?: string;
    };

export function runPhase(run: RunItem): ActiveRun["phase"] {
  if (run.failed) return "failed";
  if (run.done >= STEP_COUNT && run.review) return "done";
  return run.upload ? "reviewing" : "uploading";
}

export function toActiveRun(run: RunItem): ActiveRun {
  return {
    key: run.id,
    label: run.label,
    fileCount: run.files.length,
    submissionId: run.upload?.id,
    facilityName: run.upload?.facilityShortName || run.upload?.facilityName,
    phase: runPhase(run),
    startedAt: run.startedAt,
    error: run.failed?.message,
  };
}

/** Returns what is wrong with a package, or null when it can be uploaded. */
export function packageProblem(files: PickedFile[]): { title: string; text: string } | null {
  if (files.length === 0)
    return {
      title: "No files found",
      text: "I could not find any files in what you dropped. Drop the submission folder itself, or choose it with the folder picker.",
    };
  if (!files.some((f) => isWorkbook(f.relativePath)))
    return {
      title: "The emissions report workbook is missing",
      text: "A submission needs the EAD MRV emissions report workbook (.xlsx). Add it to the folder and drop the folder again. PDF and CSV evidence files are read alongside it.",
    };
  return null;
}

/** Name of a single dropped folder or file. Must be called synchronously inside the drop handler. */
export function dropLabel(dt: DataTransfer): string | undefined {
  const entries = Array.from(dt.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.webkitGetAsEntry())
    .filter((entry): entry is FileSystemEntry => entry !== null);
  return entries.length === 1 ? entries[0].name : undefined;
}

/** Folder name from a folder picker ("DEC_Southern-Dunes-CPF2_RY2025/x.pdf" gives the folder). */
export function pickerLabel(list: FileList): string | undefined {
  const first = list[0]?.webkitRelativePath;
  return first && first.includes("/") ? first.split("/")[0] : undefined;
}

export function packageLabel(files: PickedFile[], hint?: string) {
  if (hint) return hint;
  if (files.length === 1) return files[0].file.name;
  return `${formatInt(files.length)} files`;
}

export const totalBytes = (files: PickedFile[]) => files.reduce((sum, f) => sum + f.file.size, 0);

/** Workbook first, then top-level files, then subfolders. */
export function orderForDisplay(files: PickedFile[]) {
  const sorted = mergeFiles([], files);
  return [...sorted.filter((f) => isWorkbook(f.relativePath)), ...sorted.filter((f) => !isWorkbook(f.relativePath))];
}

/** "<1 ms" instead of "0 ms" for steps that finish instantly. */
export const stepDuration = (ms: number | undefined) => (ms !== undefined && ms < 1 ? "<1 ms" : formatDuration(ms));

/** One-line result for a finished step, from the real data. */
export function stepDetail(key: StepKey, run: RunItem): string | undefined {
  const { upload, review } = run;
  if (key === "upload") return upload ? [upload.facilityShortName || upload.facilityName, upload.eadId].filter(Boolean).join(", ") : undefined;
  if (!review) return undefined;
  const stage = review.stages.find((s) => s.name === key);
  if (stage?.status === "skipped") return "Skipped";
  if (stage?.status === "failed") return stage.detail ? `Failed: ${stage.detail}` : "Failed";
  switch (key) {
    case "ingest":
      return upload ? `${formatInt(upload.documentCount)} ${upload.documentCount === 1 ? "document" : "documents"} read` : stage?.detail;
    case "extract":
      return extractDetail(review);
    case "checks":
      return `${formatInt(review.checks.length)} checks run, ${formatInt(review.findings.length)} ${review.findings.length === 1 ? "finding" : "findings"}`;
    case "score":
      return `Risk ${Math.round(review.riskScore)} of 100, ${STATUS_LABEL[review.status].toLowerCase()}`;
    case "narrative":
      return `Recommended action: ${DECISION_LABEL[review.recommendedAction.primary].toLowerCase()}`;
  }
}

function extractDetail(review: Review): string {
  const { facts } = review;
  const parts = [
    facts.calibration.length > 0 && `${formatInt(facts.calibration.length)} calibration ${facts.calibration.length === 1 ? "certificate" : "certificates"}`,
    facts.gasAnalysis && "gas analysis",
    facts.verification && "verification statement",
    facts.monitoringPlan && "monitoring plan",
  ].filter((p): p is string => Boolean(p));
  return parts.length ? parts.join(", ") : "No PDF facts found";
}

export function stepMs(key: StepKey, run: RunItem): number | undefined {
  if (key === "upload") return run.uploadMs;
  return run.review?.stages.find((s) => s.name === key)?.durationMs;
}

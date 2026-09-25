import type { SubmissionSummary } from "@zerocarbon/shared";
import type { PickedFile } from "../_components/inbox/collect-files";
import { api } from "./api";

/** A run as the home screen tracks it while it moves through upload and review. */
export interface ActiveRun {
  /** Client id for the run (stable before the server assigns a submission id). */
  key: string;
  /** Folder or file name the officer dropped. */
  label: string;
  fileCount: number;
  submissionId?: string;
  facilityName?: string;
  phase: "uploading" | "reviewing" | "done" | "failed";
  startedAt: number;
  error?: string;
}

/**
 * Rebuilds a demo submission's folder from the API (every document with its relative path), so a
 * sample run goes through the same upload and review as a dropped folder.
 */
export async function loadSampleFolder(submissionId: string, signal?: AbortSignal): Promise<{ label: string; files: PickedFile[] }> {
  const detail = await api.submission(submissionId, signal);
  const files = await Promise.all(
    detail.documents.map(async (doc) => {
      const res = await fetch(api.documentUrl(detail.id, doc.id), { cache: "no-store", signal });
      if (!res.ok) throw new Error(`Could not load ${doc.fileName} (status ${res.status})`);
      const blob = await res.blob();
      return { file: new File([blob], doc.fileName, { type: doc.mediaType || blob.type }), relativePath: doc.relativePath };
    }),
  );
  return { label: `${detail.facilityShortName} (sample folder)`, files };
}

/** Demo submissions that ship with the app and can be used as samples. */
export const demoSubmissions = (all: SubmissionSummary[]) => all.filter((s) => s.source === "demo");

/**
 * The home screen shows completed runs to open. On a fresh install the demo submissions have not
 * been reviewed yet, so review them once (about a second in demo mode). Returns true if it ran.
 */
export async function ensureDemoRunsComplete(all: SubmissionSummary[], signal?: AbortSignal): Promise<boolean> {
  if (!demoSubmissions(all).some((s) => s.stage === "not_reviewed" || s.stage === "failed")) return false;
  await api.reviewAll(signal);
  return true;
}

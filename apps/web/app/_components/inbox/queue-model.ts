import type { SubmissionSummary } from "@zerocarbon/shared";

export type QueueFilter = "all" | "action" | "awaiting" | "not_reviewed" | "decided";

/** Filters for the review queue. They overlap on purpose: "All" contains everything. */
export const QUEUE_FILTERS: { value: QueueFilter; label: string; match: (s: SubmissionSummary) => boolean }[] = [
  { value: "all", label: "All", match: () => true },
  { value: "action", label: "Needs action", match: (s) => s.status === "non_compliant" || s.status === "needs_clarification" },
  { value: "awaiting", label: "Awaiting decision", match: (s) => s.stage === "reviewed" },
  { value: "not_reviewed", label: "Not reviewed", match: (s) => !isReviewed(s) },
  { value: "decided", label: "Decided", match: (s) => s.stage === "decided" },
];

/** A submission counts as reviewed once it has a risk score from a completed review. */
export function isReviewed(s: SubmissionSummary) {
  return s.riskScore !== undefined;
}

export function matchesSearch(s: SubmissionSummary, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [s.facilityName, s.facilityShortName, s.operator, s.eadId].some((field) => field.toLowerCase().includes(q));
}

/** Reviewed first by risk score (highest first), then unreviewed by submission date (oldest first). */
export function sortQueue(list: SubmissionSummary[]) {
  return [...list].sort((a, b) => {
    const ar = isReviewed(a);
    const br = isReviewed(b);
    if (ar !== br) return ar ? -1 : 1;
    const byRisk = ar ? (b.riskScore ?? 0) - (a.riskScore ?? 0) : 0;
    const byDate = (a.submittedOn ?? "9999").localeCompare(b.submittedOn ?? "9999");
    return byRisk || (ar ? 0 : byDate) || a.facilityShortName.localeCompare(b.facilityShortName);
  });
}

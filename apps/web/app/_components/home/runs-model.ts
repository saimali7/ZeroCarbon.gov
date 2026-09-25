import type { SubmissionSummary } from "@zerocarbon/shared";
import type { ActiveRun } from "../../_lib/runs";

export type RunFilter = "all" | "action" | "compliant" | "progress";
export type RunState = "uploading" | "reviewing" | "reviewed" | "failed" | "not_reviewed";

/** One row of the runs list: a server submission, the live run, or both merged. */
export interface RunItem {
  key: string;
  summary?: SubmissionSummary;
  live?: ActiveRun;
  state: RunState;
  /** Epoch ms when the officer started this run in the current browser session. */
  startedAt?: number;
  /** Completed in this browser session. */
  isNew: boolean;
}

/** ActiveRun.startedAt may come from Date.now() or performance.now(); normalise to epoch ms. */
export const toEpoch = (t: number) => (t > 1e12 ? t : Date.now() - (performance.now() - t));

const isReviewed = (s?: SubmissionSummary) => s?.riskScore !== undefined;

function stateOf(summary: SubmissionSummary | undefined, live: ActiveRun | undefined): RunState {
  if (live?.phase === "uploading") return "uploading";
  if (live?.phase === "reviewing") return "reviewing";
  if (live?.phase === "failed") return "failed";
  if (live?.phase === "done" && !isReviewed(summary) && summary?.stage !== "failed") return "reviewing";
  if (!summary) return "reviewing";
  if (summary.stage === "reviewing") return "reviewing";
  if (summary.stage === "failed") return "failed";
  return isReviewed(summary) ? "reviewed" : "not_reviewed";
}

export const needsAction = (r: RunItem) =>
  r.state === "reviewed" && r.summary?.stage !== "decided" && (r.summary?.status === "non_compliant" || r.summary?.status === "needs_clarification");

export const RUN_FILTERS: { value: RunFilter; label: string; match: (r: RunItem) => boolean }[] = [
  { value: "all", label: "All", match: () => true },
  { value: "action", label: "Needs action", match: needsAction },
  { value: "compliant", label: "Compliant", match: (r) => r.state === "reviewed" && r.summary?.status === "compliant" },
  { value: "progress", label: "In progress", match: (r) => r.state === "uploading" || r.state === "reviewing" || r.state === "not_reviewed" },
];

/**
 * Merges the server list with the live run and session history, then orders it:
 * in progress first, then runs completed this session (newest first), then reviewed by risk,
 * then failed and not yet reviewed.
 */
export function buildRuns(
  list: SubmissionSummary[],
  activeRun: ActiveRun | null,
  session: Record<string, number>,
  seeding: boolean,
): RunItem[] {
  const items: RunItem[] = list.map((raw) => {
    const summary: SubmissionSummary =
      seeding && raw.source === "demo" && (raw.stage === "not_reviewed" || raw.stage === "failed") ? { ...raw, stage: "reviewing" } : raw;
    const live = activeRun?.submissionId === raw.id ? activeRun : undefined;
    return {
      key: live ? live.key : raw.id,
      summary,
      live,
      state: stateOf(summary, live),
      startedAt: live ? toEpoch(live.startedAt) : session[raw.id],
      isNew: session[raw.id] !== undefined && isReviewed(summary),
    };
  });
  if (activeRun && !items.some((r) => r.live)) {
    items.push({ key: activeRun.key, live: activeRun, state: stateOf(undefined, activeRun), startedAt: toEpoch(activeRun.startedAt), isNew: false });
  }
  const rank = (r: RunItem) =>
    r.state === "uploading" || r.state === "reviewing" || (r.live && r.state === "failed") ? 0 : r.isNew ? 1 : r.state === "reviewed" ? 2 : r.state === "failed" ? 3 : 4;
  return items.sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank) return byRank;
    if (a.live !== b.live) return a.live ? -1 : 1;
    const byTime = rank(a) === 1 ? (b.startedAt ?? 0) - (a.startedAt ?? 0) : 0;
    const byRisk = (b.summary?.riskScore ?? 0) - (a.summary?.riskScore ?? 0);
    const byRecent = (b.summary?.reviewedAt ?? "").localeCompare(a.summary?.reviewedAt ?? "");
    return byTime || byRisk || byRecent || (a.summary?.facilityShortName ?? "").localeCompare(b.summary?.facilityShortName ?? "");
  });
}

const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" });
const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", hour: "2-digit", minute: "2-digit" });
const dayMonth = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dubai", day: "numeric", month: "short" });

/** "today 16:42" or "24 Sep 16:42" (UAE time). */
export function formatWhen(epoch: number): string {
  const d = new Date(epoch);
  const today = dayKey.format(d) === dayKey.format(new Date());
  return `${today ? "today" : dayMonth.format(d)} ${clock.format(d)}`;
}

const SESSION_KEY = "zc-home-runs";

/** Runs completed in this browser session: submission id to start time (epoch ms). */
export function readSession(): Record<string, number> {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function writeSession(value: Record<string, number>) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode): the "New" marker is only cosmetic */
  }
}

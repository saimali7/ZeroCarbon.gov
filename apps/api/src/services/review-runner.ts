import type { Review, ReviewAllResponse } from "@zerocarbon/shared";
import type { AppDeps } from "../app.ts";
import { HttpError } from "../lib/http.ts";
import { errorMessage, recordAudit } from "./audit.ts";

export interface StageProbe {
  isRunning(submissionId: string): boolean;
  /** Error message of the last run, if it failed (cleared by the next successful run). */
  failure(submissionId: string): string | undefined;
}

export interface ReviewRunner extends StageProbe {
  /** Runs, stores and audits a review. Concurrent calls for the same id share one run. */
  run(submissionId: string): Promise<Review>;
  runAll(options?: { force?: boolean; concurrency?: number }): Promise<ReviewAllResponse>;
  /** Forget failures (demo reset). */
  reset(): void;
}

const ms = (start: number) => Math.round(performance.now() - start);

export function createReviewRunner(deps: AppDeps): ReviewRunner {
  const inFlight = new Map<string, Promise<Review>>();
  const failures = new Map<string, string>();

  async function execute(submissionId: string): Promise<Review> {
    if (!(await deps.catalog.get(submissionId))) throw new HttpError(404, `Submission ${submissionId} not found`);
    await recordAudit(deps, { type: "review_started", submissionId, message: "AI review started" });
    try {
      const review = await deps.pipeline.run(submissionId);
      await deps.store.saveReview(review);
      failures.delete(submissionId);
      await recordAudit(deps, {
        type: "review_completed",
        submissionId,
        message: `Review completed: ${review.status.replace(/_/g, " ")}, risk ${review.riskScore}/100, ${review.findings.length} finding(s) in ${(review.durationMs / 1000).toFixed(1)} s`,
      });
      return review;
    } catch (err) {
      const message = errorMessage(err);
      failures.set(submissionId, message);
      console.error(`[review] ${submissionId} failed:`, err);
      await recordAudit(deps, { type: "review_failed", submissionId, message: `Review failed: ${message}` });
      throw err instanceof HttpError ? err : new HttpError(500, `Review failed: ${message}`);
    }
  }

  function run(submissionId: string) {
    const existing = inFlight.get(submissionId);
    if (existing) return existing;
    const promise = execute(submissionId).finally(() => {
      if (inFlight.get(submissionId) === promise) inFlight.delete(submissionId);
    });
    inFlight.set(submissionId, promise);
    return promise;
  }

  async function runAll({ force = false, concurrency = 2 } = {}): Promise<ReviewAllResponse> {
    const started = performance.now();
    const records = await deps.catalog.list();
    const targets = force ? records : records.filter((r) => !deps.store.getLatestReview(r.id));
    const results: ReviewAllResponse["results"] = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < targets.length) {
        const index = cursor++;
        const submissionId = targets[index].id;
        const t0 = performance.now();
        try {
          const review = await run(submissionId);
          results[index] = { submissionId, status: review.status, riskScore: review.riskScore, durationMs: ms(t0) };
        } catch (err) {
          results[index] = { submissionId, durationMs: ms(t0), error: errorMessage(err) };
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
    const failed = results.filter((r) => r.error).length;
    return { reviewed: results.length - failed, failed, durationMs: ms(started), results };
  }

  return {
    run,
    runAll,
    isRunning: (id) => inFlight.has(id),
    failure: (id) => failures.get(id),
    reset: () => failures.clear(),
  };
}

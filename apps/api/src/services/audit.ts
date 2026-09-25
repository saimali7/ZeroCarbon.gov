import type { AuditEventType } from "@zerocarbon/shared";
import type { AppDeps } from "../app.ts";

type ClockDeps = Pick<AppDeps, "now">;

export const nowIso = (deps: ClockDeps) => (deps.now?.() ?? new Date()).toISOString();

export function recordAudit(
  deps: Pick<AppDeps, "store" | "now">,
  event: { type: AuditEventType; message: string; submissionId?: string; actor?: string },
) {
  return deps.store.appendAudit({
    type: event.type,
    ...(event.submissionId ? { submissionId: event.submissionId } : {}),
    actor: event.actor ?? "system",
    message: event.message,
    createdAt: nowIso(deps),
  });
}

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

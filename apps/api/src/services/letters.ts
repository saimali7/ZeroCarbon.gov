import type {
  DecisionAction,
  DecisionRequest,
  DecisionResponse,
  Letter,
  LetterDraftRequest,
  LetterUpdateRequest,
  Review,
} from "@zerocarbon/shared";
import type { AppDeps } from "../app.ts";
import { HttpError } from "../lib/http.ts";
import type { SubmissionRecord } from "../types.ts";
import { nowIso, recordAudit } from "./audit.ts";
import { buildIdentity, requireRecord } from "./summaries.ts";

export const ACTION_LABELS: Record<DecisionAction, string> = {
  approve: "Approve",
  request_clarification: "Request clarification",
  escalate_inspection: "Escalate to inspection",
  refer_penalty: "Refer for penalty",
};

type LetterDeps = Pick<AppDeps, "catalog" | "store" | "ai" | "rules" | "now">;

async function requireReview(deps: LetterDeps, id: string, what: string): Promise<{ record: SubmissionRecord; review: Review }> {
  const record = await requireRecord(deps.catalog, id);
  const review = deps.store.getLatestReview(id);
  if (!review) throw new HttpError(409, `Run the AI review before ${what}`);
  return { record, review };
}

async function createDraft(deps: LetterDeps, record: SubmissionRecord, review: Review, action: DecisionAction, officerName?: string) {
  const pkg = await deps.catalog.loadPackage(record.id);
  const output = await deps.ai.draftLetter({
    identity: buildIdentity(record, pkg.report),
    review,
    action,
    officerName,
    rules: deps.rules.list(),
  });
  const at = nowIso(deps);
  const letter = await deps.store.createLetter({
    submissionId: record.id,
    reviewId: review.id,
    action,
    en: output.en,
    ar: output.ar,
    reference: output.reference,
    generatedBy: output.generatedBy,
    ...(output.model ? { model: output.model } : {}),
    status: "draft",
    createdAt: at,
    updatedAt: at,
  });
  await recordAudit(deps, {
    type: "letter_drafted",
    submissionId: record.id,
    actor: officerName,
    message: `${ACTION_LABELS[action]} letter ${letter.reference} drafted (${letter.generatedBy})`,
  });
  return letter;
}

/** Records the officer's decision and (unless disabled) drafts the matching bilingual letter. */
export async function recordDecision(deps: LetterDeps, id: string, body: DecisionRequest): Promise<DecisionResponse> {
  const { record, review } = await requireReview(deps, id, "recording a decision");
  const note = body.note?.trim();
  // Draft first so a failed draft leaves no half-recorded decision behind.
  const letter = body.draftLetter === false ? undefined : await createDraft(deps, record, review, body.action, body.officerName);
  const decision = await deps.store.addDecision({
    submissionId: id,
    reviewId: review.id,
    action: body.action,
    officerName: body.officerName,
    ...(note ? { note } : {}),
    createdAt: nowIso(deps),
    ...(letter ? { letterId: letter.id } : {}),
  });
  await recordAudit(deps, {
    type: "decision_recorded",
    submissionId: id,
    actor: body.officerName,
    message: `Decision recorded: ${ACTION_LABELS[body.action]} (risk ${review.riskScore}/100)${note ? `. Note: ${note}` : ""}`,
  });
  return letter ? { decision, letter } : { decision };
}

export async function draftLetter(deps: LetterDeps, id: string, body: LetterDraftRequest): Promise<Letter> {
  const { record, review } = await requireReview(deps, id, "drafting a letter");
  return createDraft(deps, record, review, body.action);
}

export async function listLetters(deps: LetterDeps, id: string): Promise<Letter[]> {
  await requireRecord(deps.catalog, id);
  return deps.store.listLetters(id);
}

export function getLetter(deps: Pick<AppDeps, "store">, letterId: string): Letter {
  const letter = deps.store.getLetter(letterId);
  if (!letter) throw new HttpError(404, `Letter ${letterId} not found`);
  return letter;
}

export async function updateLetter(deps: LetterDeps, letterId: string, body: LetterUpdateRequest): Promise<Letter> {
  const letter = getLetter(deps, letterId);
  const reopening = letter.status === "approved" && body.status === "draft";
  if (letter.status === "approved" && !reopening) throw new HttpError(409, "This letter has been approved: set status to draft to edit it again");
  const approving = body.status === "approved";
  if (approving && !body.officerName) throw new HttpError(400, "officerName is required to approve a letter");
  const at = nowIso(deps);
  const updated = await deps.store.updateLetter(letterId, {
    ...(body.en ? { en: body.en } : {}),
    ...(body.ar ? { ar: body.ar } : {}),
    updatedAt: at,
    ...(approving ? { status: "approved" as const, approvedBy: body.officerName, approvedAt: at } : {}),
    ...(reopening ? { status: "draft" as const, approvedBy: undefined, approvedAt: undefined } : {}),
  });
  if (!updated) throw new HttpError(404, `Letter ${letterId} not found`);
  const actor = body.officerName;
  const edited = [body.en && "English", body.ar && "Arabic"].filter(Boolean).join(" and ");
  if (edited) {
    await recordAudit(deps, { type: "letter_updated", submissionId: letter.submissionId, actor, message: `Letter ${letter.reference} edited (${edited})` });
  }
  if (approving) {
    await recordAudit(deps, { type: "letter_approved", submissionId: letter.submissionId, actor, message: `Letter ${letter.reference} approved` });
  }
  return updated;
}

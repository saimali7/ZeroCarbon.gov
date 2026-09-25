import { z } from "zod";

export const officerName = z.string().trim().min(1, "officerName is required").max(80);

export const decisionAction = z.enum(["approve", "request_clarification", "escalate_inspection", "refer_penalty"]);

const letterContent = z.object({
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(20_000),
});

export const decisionRequest = z.object({
  action: decisionAction,
  officerName,
  note: z.string().max(2000).optional(),
  draftLetter: z.boolean().optional(),
});

export const letterDraftRequest = z.object({ action: decisionAction });

export const letterUpdateRequest = z
  .object({
    en: letterContent.optional(),
    ar: letterContent.optional(),
    status: z.enum(["draft", "approved"]).optional(),
    officerName: officerName.optional(),
  })
  .refine((b) => b.en || b.ar || b.status, { message: "Provide en, ar or status" })
  .refine((b) => b.status !== "approved" || b.officerName, {
    message: "officerName is required to approve a letter",
    path: ["officerName"],
  });

export const askRequest = z.object({ question: z.string().trim().min(3).max(500) });

export const listQuery = z.object({
  status: z.enum(["compliant", "needs_clarification", "non_compliant"]).optional(),
  stage: z.enum(["not_reviewed", "reviewing", "reviewed", "decided", "failed"]).optional(),
  q: z.string().max(200).optional(),
});

export const auditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  submissionId: z.string().optional(),
});

export const resetRequest = z.object({ keepUploads: z.boolean().default(true) }).default({ keepUploads: true });

/** `?flag=true` / `?flag=1` */
export const queryFlag = (value: unknown) => value === "true" || value === "1";

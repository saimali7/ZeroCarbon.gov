/**
 * REST routes shared by the API and the web app. The web client builds every URL
 * from `apiRoutes`, and the API registers the same paths, so the two cannot drift.
 *
 * All responses are JSON unless noted. Errors use `ApiError` with a 4xx/5xx status.
 * Import from "@zerocarbon/shared/routes".
 */
import type {
  AskRequest,
  AskResponse,
  AuditEvent,
  DashboardResponse,
  DecisionRequest,
  DecisionResponse,
  DocumentTextResponse,
  HealthResponse,
  Letter,
  LetterDraftRequest,
  LetterUpdateRequest,
  ReferenceData,
  RegulationRule,
  Review,
  ReviewAllResponse,
  SubmissionDetail,
  SubmissionSummary,
} from "./index";

const seg = encodeURIComponent;

export const apiRoutes = {
  /** GET → HealthResponse */
  health: () => "/api/health",
  /** GET → DashboardResponse */
  dashboard: () => "/api/dashboard",
  /**
   * GET → SubmissionSummary[] (every submission, reviewed or not).
   * POST multipart/form-data → SubmissionSummary (201): repeated `files` parts, plus a repeated
   * `relativePaths` field in the same order (e.g. "evidence/flare-log.csv"). 400 if no EAD workbook.
   */
  submissions: () => "/api/submissions",
  /** GET → SubmissionDetail (documents, parsed report, latest review, decisions, letters). */
  submission: (id: string) => `/api/submissions/${seg(id)}`,
  /** POST (no body) → Review. Runs the full pipeline and stores the result as the latest review. */
  review: (id: string) => `/api/submissions/${seg(id)}/review`,
  /** POST (no body) → ReviewAllResponse. Reviews every submission. */
  reviewAll: () => "/api/review-all",
  /** GET → the original file bytes, with its Content-Type and `Content-Disposition: inline`. */
  document: (id: string, documentId: string) => `/api/submissions/${seg(id)}/documents/${seg(documentId)}`,
  /** GET → DocumentTextResponse (PDF text per page, or a text rendering of CSV/XLSX). */
  documentText: (id: string, documentId: string) => `/api/submissions/${seg(id)}/documents/${seg(documentId)}/text`,
  /** POST AskRequest → AskResponse. Question about one submission, answered with citations. */
  ask: (id: string) => `/api/submissions/${seg(id)}/ask`,
  /** POST DecisionRequest → DecisionResponse. Records the officer decision and drafts a letter. */
  decisions: (id: string) => `/api/submissions/${seg(id)}/decisions`,
  /** POST LetterDraftRequest → Letter. Drafts (or re-drafts) a letter without recording a decision. */
  letters: (id: string) => `/api/submissions/${seg(id)}/letters`,
  /** PATCH LetterUpdateRequest → Letter. Edit either language, or approve (status "approved"). */
  letter: (letterId: string) => `/api/letters/${seg(letterId)}`,
  /** GET → ReferenceData (peers, prior year, satellite detections, facility points). */
  reference: () => "/api/reference",
  /** GET → RegulationRule[] (the corpus every finding cites). */
  regulations: () => "/api/regulations",
  /** GET → AuditEvent[], newest first. Optional `?submissionId=` filter. */
  audit: (submissionId?: string) => (submissionId ? `/api/audit?submissionId=${seg(submissionId)}` : "/api/audit"),
  /** POST (no body) → { ok: true }. Clears reviews, decisions, letters and uploads. */
  demoReset: () => "/api/demo/reset",
} as const;

/** Multipart field names for POST /api/submissions. */
export const uploadFields = { files: "files", relativePaths: "relativePaths" } as const;

/** Request and response body types per route, for typed clients and handlers. */
export interface ApiContract {
  health: { method: "GET"; response: HealthResponse };
  dashboard: { method: "GET"; response: DashboardResponse };
  listSubmissions: { method: "GET"; response: SubmissionSummary[] };
  uploadSubmission: { method: "POST"; request: FormData; response: SubmissionSummary };
  submission: { method: "GET"; response: SubmissionDetail };
  review: { method: "POST"; response: Review };
  reviewAll: { method: "POST"; response: ReviewAllResponse };
  documentText: { method: "GET"; response: DocumentTextResponse };
  ask: { method: "POST"; request: AskRequest; response: AskResponse };
  decisions: { method: "POST"; request: DecisionRequest; response: DecisionResponse };
  letters: { method: "POST"; request: LetterDraftRequest; response: Letter };
  letter: { method: "PATCH"; request: LetterUpdateRequest; response: Letter };
  reference: { method: "GET"; response: ReferenceData };
  regulations: { method: "GET"; response: RegulationRule[] };
  audit: { method: "GET"; response: AuditEvent[] };
  demoReset: { method: "POST"; response: { ok: true } };
}

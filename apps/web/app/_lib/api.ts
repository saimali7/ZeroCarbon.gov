import type {
  ApiError,
  AskResponse,
  AuditEvent,
  DashboardResponse,
  DecisionAction,
  DecisionRequest,
  DecisionResponse,
  DocumentTextResponse,
  HealthResponse,
  Letter,
  LetterUpdateRequest,
  ReferenceData,
  RegulationRule,
  Review,
  ReviewAllResponse,
  SubmissionDetail,
  SubmissionSummary,
} from "@zerocarbon/shared";
import { apiRoutes, uploadFields } from "@zerocarbon/shared/routes";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { cache: "no-store", ...init });
  } catch (err) {
    if (init?.signal?.aborted) throw err;
    throw new ApiRequestError("Could not reach the server. Check your connection and try again.", 0);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const apiError = body as ApiError | null;
    throw new ApiRequestError(apiError?.error ?? `Request failed with status ${res.status}`, res.status, apiError?.details);
  }
  return body as T;
}

function json(method: string, body?: unknown, signal?: AbortSignal): RequestInit {
  return {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  };
}

/** Kept for the earlier health check component. */
export function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { signal });
}

export const api = {
  health: (signal?: AbortSignal) => request<HealthResponse>(apiRoutes.health(), { signal }),
  dashboard: (signal?: AbortSignal) => request<DashboardResponse>(apiRoutes.dashboard(), { signal }),
  submissions: (signal?: AbortSignal) => request<SubmissionSummary[]>(apiRoutes.submissions(), { signal }),
  submission: (id: string, signal?: AbortSignal) => request<SubmissionDetail>(apiRoutes.submission(id), { signal }),
  reference: (signal?: AbortSignal) => request<ReferenceData>(apiRoutes.reference(), { signal }),
  regulations: (signal?: AbortSignal) => request<RegulationRule[]>(apiRoutes.regulations(), { signal }),
  audit: (submissionId?: string, signal?: AbortSignal) => request<AuditEvent[]>(apiRoutes.audit(submissionId), { signal }),
  documentText: (id: string, documentId: string, signal?: AbortSignal) =>
    request<DocumentTextResponse>(apiRoutes.documentText(id, documentId), { signal }),
  /** URL of the original file, for links and iframes. */
  documentUrl: (id: string, documentId: string) => apiRoutes.document(id, documentId),

  review: (id: string, signal?: AbortSignal) => request<Review>(apiRoutes.review(id), json("POST", undefined, signal)),
  reviewAll: (signal?: AbortSignal) => request<ReviewAllResponse>(apiRoutes.reviewAll(), json("POST", undefined, signal)),
  ask: (id: string, question: string, signal?: AbortSignal) =>
    request<AskResponse>(apiRoutes.ask(id), json("POST", { question }, signal)),
  decide: (id: string, body: DecisionRequest, signal?: AbortSignal) =>
    request<DecisionResponse>(apiRoutes.decisions(id), json("POST", body, signal)),
  draftLetter: (id: string, action: DecisionAction, signal?: AbortSignal) =>
    request<Letter>(apiRoutes.letters(id), json("POST", { action }, signal)),
  updateLetter: (letterId: string, body: LetterUpdateRequest, signal?: AbortSignal) =>
    request<Letter>(apiRoutes.letter(letterId), json("PATCH", body, signal)),
  resetDemo: () => request<{ ok: true }>(apiRoutes.demoReset(), json("POST")),

  /** Upload a submission package. `relativePath` keeps folder structure (e.g. "evidence/flare-log.csv"). */
  upload: (files: { file: File; relativePath: string }[], signal?: AbortSignal) => {
    const form = new FormData();
    for (const { file, relativePath } of files) {
      form.append(uploadFields.files, file, file.name);
      form.append(uploadFields.relativePaths, relativePath);
    }
    return request<SubmissionSummary>(apiRoutes.submissions(), { method: "POST", body: form, signal });
  },
};

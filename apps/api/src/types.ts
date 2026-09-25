/**
 * API-internal contracts between modules. Each module is built against these
 * interfaces so it can be developed and tested in isolation, then wired
 * together in src/index.ts.
 */
import type {
  AiMode,
  AiObservation,
  AskResponse,
  CheckRun,
  DecisionAction,
  DocumentFacts,
  EmissionsReport,
  EvidenceData,
  Finding,
  LetterContent,
  RecommendedAction,
  ReferenceData,
  RegulationRule,
  Review,
  ReviewMetrics,
  ReviewStatus,
  RiskBand,
  Sector,
  SubmissionDocument,
  SubmissionSource,
} from "@zerocarbon/shared";
import type { OpenRouterClient } from "./ai/openrouter.ts";

// ---------------------------------------------------------------------------
// Ingestion and catalog (src/ingest, src/reference, src/catalog.ts)
// ---------------------------------------------------------------------------

export interface PageText {
  /** 1-based */
  page: number;
  text: string;
}

/** Everything parsed from one submission package (a folder of files). */
export interface SubmissionPackage {
  submissionId: string;
  source: SubmissionSource;
  rootDir: string;
  documents: SubmissionDocument[];
  /** Extracted text per PDF document id. */
  pdfText: Record<string, PageText[]>;
  /** Parsed EAD workbook, when one was found and parsed. */
  report?: EmissionsReport;
  evidence: EvidenceData;
  warnings: string[];
  loadedInMs: number;
}

/** Lightweight catalog entry, cheap to list. */
export interface SubmissionRecord {
  id: string;
  source: SubmissionSource;
  rootDir: string;
  receivedAt: string;
  facilityName: string;
  facilityShortName: string;
  operator: string;
  eadId: string;
  emirate?: string;
  sector?: Sector;
  reportingYear: number;
  submittedOn?: string;
  reportedTotalTco2e?: number;
  documentCount: number;
  lat?: number;
  lon?: number;
}

export interface UploadedFile {
  originalName: string;
  /** Optional relative path within the package, e.g. "evidence/flare-log.csv". */
  relativePath?: string;
  buffer: Buffer;
  mediaType?: string;
}

export interface SubmissionCatalog {
  list(): Promise<SubmissionRecord[]>;
  get(id: string): Promise<SubmissionRecord | undefined>;
  /** Parse (and cache) the full package. Throws HttpError(404) for unknown ids. */
  loadPackage(id: string): Promise<SubmissionPackage>;
  readDocument(id: string, documentId: string): Promise<{ document: SubmissionDocument; data: Buffer } | undefined>;
  /** Store uploaded files as a new submission package and return its record. Throws HttpError(400) if no EAD workbook is found. */
  createFromUpload(files: UploadedFile[]): Promise<SubmissionRecord>;
  /** Regulator reference data (peers, prior-year submissions, satellite detections). */
  getReference(): Promise<ReferenceData>;
  /** Reference files served as documents of any submission ("ref-peer-benchmarks", "ref-prior-year", "ref-satellite"). */
  readReferenceDocument?(documentId: string): Promise<{ document: SubmissionDocument; data: Buffer } | undefined>;
}

// ---------------------------------------------------------------------------
// AI context (src/ai, src/extract)
// ---------------------------------------------------------------------------

export interface AiContext {
  mode: AiMode;
  /** Present only in live mode. */
  client?: OpenRouterClient;
  /** Directory holding cached AI outputs used in demo mode (committed to the repo). */
  cacheDir: string;
  /** Write live AI outputs to cacheDir (used by the snapshot script). */
  writeCache?: boolean;
}

// ---------------------------------------------------------------------------
// Checks and scoring (src/checks, src/review/scoring.ts)
// ---------------------------------------------------------------------------

export interface PeerSubmission {
  submissionId: string;
  report: EmissionsReport;
}

export interface ReviewInput {
  submissionId: string;
  documents: SubmissionDocument[];
  report: EmissionsReport;
  evidence: EvidenceData;
  facts: DocumentFacts;
  reference: ReferenceData;
  /** Other parsed submissions for the same reporting year (for methane-intensity references). */
  peerSubmissions: PeerSubmission[];
}

export interface ChecksResult {
  checks: CheckRun[];
  findings: Finding[];
}

export interface ScoreResult {
  status: ReviewStatus;
  riskScore: number;
  riskBand: RiskBand;
  metrics: ReviewMetrics;
  recommendedAction: RecommendedAction;
  legalExposure?: { text: string; ruleIds: string[] };
}

// ---------------------------------------------------------------------------
// Review pipeline (src/review/pipeline.ts)
// ---------------------------------------------------------------------------

export interface ReviewPipeline {
  /** Ingest, extract, check, score and narrate one submission. Does not persist anything. */
  run(submissionId: string, options?: { signal?: AbortSignal }): Promise<Review>;
}

// ---------------------------------------------------------------------------
// AI writer (src/ai)
// ---------------------------------------------------------------------------

export interface SubmissionIdentity {
  submissionId: string;
  facilityName: string;
  facilityShortName: string;
  operator: string;
  operatorAr?: string;
  eadId: string;
  permit?: string;
  reportingYear: number;
  submittedOn?: string;
  contactName?: string;
}

export interface NarrativeInput {
  identity: SubmissionIdentity;
  findings: Finding[];
  checks: CheckRun[];
  metrics: ReviewMetrics;
  status: ReviewStatus;
  riskScore: number;
  recommendedAction: RecommendedAction;
  rules: RegulationRule[];
  /** Hash of the inputs, used as the cache key. */
  inputHash: string;
}

export interface NarrativeOutput {
  headline: string;
  summary: string;
  /** Plain-language explanation per finding id. */
  explanations: Record<string, string>;
  source: "llm" | "cache" | "template";
  model?: string;
}

export interface LetterInput {
  identity: SubmissionIdentity;
  review: Review;
  action: DecisionAction;
  officerName?: string;
  rules: RegulationRule[];
}

export interface LetterOutput {
  en: LetterContent;
  ar: LetterContent;
  reference: string;
  generatedBy: "llm" | "cache" | "template";
  model?: string;
}

export interface AskInput {
  identity: SubmissionIdentity;
  question: string;
  review?: Review;
  pkg?: SubmissionPackage;
  rules: RegulationRule[];
}

export interface ObservationsInput {
  identity: SubmissionIdentity;
  pkg: SubmissionPackage;
  findings: Finding[];
  rules: RegulationRule[];
  /** Cache key for demo-mode replay. */
  inputHash?: string;
}

export type { AskResponse, AiObservation };

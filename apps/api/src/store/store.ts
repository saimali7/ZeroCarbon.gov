import { randomUUID } from "node:crypto";
import { readFileSync, renameSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { AuditEvent, Decision, Letter, Review } from "@zerocarbon/shared";

export interface StoreState {
  version: 1;
  reviews: Review[];
  decisions: Decision[];
  letters: Letter[];
  audit: AuditEvent[];
}

export type NewDecision = Omit<Decision, "id">;
export type NewLetter = Omit<Letter, "id">;
export type LetterPatch = Partial<Pick<Letter, "en" | "ar" | "status" | "approvedBy" | "approvedAt" | "updatedAt">>;
export type NewAuditEvent = Omit<AuditEvent, "id">;

export interface ResetReport {
  keepUploads: boolean;
  cleared: { reviews: number; decisions: number; letters: number; audit: number };
}

/**
 * Runtime state: reviews (with history), decisions, letters and the audit log.
 * Reads are synchronous from memory; mutations resolve once the change is on disk.
 * Lists are newest first. Returned objects are shared: treat them as read-only.
 */
export interface Store {
  saveReview(review: Review): Promise<Review>;
  getLatestReview(submissionId: string): Review | undefined;
  listReviews(submissionId: string): Review[];
  addDecision(input: NewDecision): Promise<Decision>;
  getLatestDecision(submissionId: string): Decision | undefined;
  listDecisions(submissionId?: string): Decision[];
  createLetter(input: NewLetter): Promise<Letter>;
  updateLetter(id: string, patch: LetterPatch): Promise<Letter | undefined>;
  getLetter(id: string): Letter | undefined;
  listLetters(submissionId?: string): Letter[];
  appendAudit(input: NewAuditEvent): Promise<AuditEvent>;
  listAudit(options?: { limit?: number; submissionId?: string }): AuditEvent[];
  /** Clears reviews, decisions, letters and audit. Uploaded packages belong to the catalog and are not touched. */
  reset(options?: { keepUploads?: boolean }): Promise<ResetReport>;
  /** Resolves when all pending writes have finished. */
  flush(): Promise<void>;
}

const MAX_REVIEWS_PER_SUBMISSION = 20;
const MAX_AUDIT_EVENTS = 5000;

export const emptyState = (): StoreState => ({ version: 1, reviews: [], decisions: [], letters: [], audit: [] });

const newestFirst = <T extends { submissionId?: string }>(items: T[], submissionId?: string) =>
  items.filter((item) => submissionId === undefined || item.submissionId === submissionId).reverse();

const findLast = <T extends { submissionId?: string }>(items: T[], submissionId: string) =>
  items.findLast((item) => item.submissionId === submissionId);

function createStoreWith(state: StoreState, persist: () => Promise<void>, flush: () => Promise<void>): Store {
  return {
    async saveReview(review) {
      state.reviews.push(review);
      const history = state.reviews.filter((r) => r.submissionId === review.submissionId);
      if (history.length > MAX_REVIEWS_PER_SUBMISSION) {
        const drop = new Set(history.slice(0, history.length - MAX_REVIEWS_PER_SUBMISSION));
        state.reviews = state.reviews.filter((r) => !drop.has(r));
      }
      await persist();
      return review;
    },
    getLatestReview: (submissionId) => findLast(state.reviews, submissionId),
    listReviews: (submissionId) => newestFirst(state.reviews, submissionId),

    async addDecision(input) {
      const decision: Decision = { id: randomUUID(), ...input };
      state.decisions.push(decision);
      await persist();
      return decision;
    },
    getLatestDecision: (submissionId) => findLast(state.decisions, submissionId),
    listDecisions: (submissionId) => newestFirst(state.decisions, submissionId),

    async createLetter(input) {
      const letter: Letter = { id: randomUUID(), ...input };
      state.letters.push(letter);
      await persist();
      return letter;
    },
    async updateLetter(id, patch) {
      const index = state.letters.findIndex((l) => l.id === id);
      if (index < 0) return undefined;
      const letter: Letter = { ...state.letters[index], ...patch };
      state.letters[index] = letter;
      await persist();
      return letter;
    },
    getLetter: (id) => state.letters.find((l) => l.id === id),
    listLetters: (submissionId) => newestFirst(state.letters, submissionId),

    async appendAudit(input) {
      const event: AuditEvent = { id: randomUUID(), ...input };
      state.audit.push(event);
      if (state.audit.length > MAX_AUDIT_EVENTS) state.audit.splice(0, state.audit.length - MAX_AUDIT_EVENTS);
      await persist();
      return event;
    },
    listAudit({ limit = 50, submissionId } = {}) {
      return newestFirst(state.audit, submissionId).slice(0, Math.max(0, limit));
    },

    async reset({ keepUploads = true } = {}) {
      const cleared = {
        reviews: state.reviews.length,
        decisions: state.decisions.length,
        letters: state.letters.length,
        audit: state.audit.length,
      };
      Object.assign(state, emptyState());
      await persist();
      return { keepUploads, cleared };
    },
    flush,
  };
}

/** In-memory store with the same interface (tests, or when persistence is not wanted). */
export function createMemoryStore(initial: StoreState = emptyState()): Store {
  const done = async () => {};
  return createStoreWith(structuredClone(initial), done, done);
}

/** JSON-file store at `${dir}/state.json`. Writes are atomic (temp file + rename) and serialized. */
export function createStore(dir: string): Store {
  const file = path.join(dir, "state.json");
  const state = loadState(file);
  let queue: Promise<void> = Promise.resolve();
  let pending: Promise<void> | undefined;

  // Coalesce: a queued write that has not started yet will pick up later mutations too.
  const persist = () => {
    pending ??= queue = queue
      .then(() => {
        pending = undefined;
        return writeAtomic(file, JSON.stringify(state, null, 2));
      })
      .catch((err) => console.error(`[store] failed to write ${file}:`, err));
    return pending;
  };

  return createStoreWith(state, persist, () => queue);
}

function loadState(file: string): StoreState {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyState();
    throw err;
  }
  try {
    return parseState(raw);
  } catch (err) {
    const aside = path.join(path.dirname(file), `state.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    try {
      renameSync(file, aside);
    } catch (renameErr) {
      console.warn(`[store] could not move ${file} aside:`, renameErr);
    }
    console.warn(`[store] ${file} is unreadable (${(err as Error).message}); moved to ${aside}, starting with empty state.`);
    return emptyState();
  }
}

function parseState(raw: string): StoreState {
  const data = JSON.parse(raw) as Partial<StoreState> | null;
  if (!data || data.version !== 1) throw new Error("unsupported state version");
  for (const key of ["reviews", "decisions", "letters", "audit"] as const) {
    if (!Array.isArray(data[key])) throw new Error(`"${key}" is not an array`);
  }
  return data as StoreState;
}

async function writeAtomic(file: string, data: string) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, data, "utf8");
  // Windows can briefly lock the target (antivirus, indexer): retry a few times.
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(tmp, file);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= 5 || !(code === "EPERM" || code === "EACCES" || code === "EBUSY")) {
        await rm(tmp, { force: true });
        throw err;
      }
      await delay(40 * attempt);
    }
  }
}

import type { AskResponse, EmissionsReport, Review } from "@zerocarbon/shared";
import type { PackageFiles } from "./refs";

/** A precomputed review; the mock adds id, submissionId, createdAt, durationMs and inputHash at run time. */
export type ReviewFixture = Omit<Review, "id" | "submissionId" | "createdAt" | "durationMs" | "inputHash">;

export type AskTopic = "calibration" | "verification" | "satellite" | "methane" | "peer" | "flare" | "default";

export type CannedAnswer = Pick<AskResponse, "answer" | "citations" | "ruleIds">;

export interface LetterItem {
  en: string;
  ar: string;
}

export interface FacilityFixture {
  key: "east" | "south";
  /** Submission id of the demo package (its folder name under demo/submissions). */
  submissionId: string;
  folder: string;
  /** File name prefix, e.g. "DEC-SDF-CPF2". */
  code: string;
  shortName: string;
  shortNameAr: string;
  facilityNameAr: string;
  manager: { en: string; ar: string };
  files: PackageFiles;
  report: EmissionsReport;
  review: ReviewFixture;
  letter: {
    /** Arabic finding titles, keyed by finding id. */
    findingTitlesAr: Record<string, string>;
    /** Numbered requests for a clarification letter, in order. */
    requests: LetterItem[];
    /** Items the inspection will examine. */
    inspection: LetterItem[];
  };
  ask: Record<AskTopic, CannedAnswer>;
}

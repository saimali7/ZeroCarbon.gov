import { EAST } from "./east";
import { SOUTH } from "./south";
import type { AskTopic, FacilityFixture } from "./types";

export { REGULATIONS } from "./regulations";
export { buildLetter } from "./letters";
export { docId, REFERENCE_DOCS } from "./refs";
export type { ReferenceKey } from "./refs";
export type { AskTopic, CannedAnswer, FacilityFixture, ReviewFixture } from "./types";

/** The two demo facilities, in inbox order. */
export const FACILITIES: FacilityFixture[] = [EAST, SOUTH];

const TOPICS: [AskTopic, RegExp][] = [
  ["calibration", /calibrat|certificate|expired|in service/i],
  ["verification", /verif|opinion|kestrel|assurance|qualified|declar/i],
  ["satellite", /satellite|plume|detection|flame.?out|imag/i],
  ["methane", /methane|\bch4\b|tank|vent|fugitive|pneumatic|seal|ldar|m-0[4-9]|de minimis/i],
  ["peer", /peer|benchmark|intensity|compar|trend|year.on.year|prior|last year|outlier/i],
  ["flare", /flare|gas balance|estimat|ft-?510[12]|data gap/i],
];

/** Picks the canned answer topic for a question by keyword. */
export function askTopic(question: string): AskTopic {
  return TOPICS.find(([, re]) => re.test(question))?.[0] ?? "default";
}

import type { AskResponse, RegulationRule } from "@zerocarbon/shared";
import type { AppDeps } from "../../src/app.ts";
import type { AskInput, LetterInput } from "../../src/types.ts";

export type FakeAi = AppDeps["ai"] & {
  letterCalls: LetterInput[];
  askCalls: AskInput[];
};

export function createFakeAi(): FakeAi {
  const letterCalls: LetterInput[] = [];
  const askCalls: AskInput[] = [];
  return {
    letterCalls,
    askCalls,
    async draftLetter(input: LetterInput) {
      letterCalls.push(input);
      return {
        en: { subject: `Re: ${input.identity.facilityShortName} (${input.action})`, body: `Dear ${input.identity.contactName},\n\nFindings: ${input.review.findings.length}.` },
        ar: { subject: `بخصوص: ${input.identity.facilityShortName}`, body: "السادة المحترمون،" },
        reference: `EAD/MRV/2026/${input.identity.eadId}/Q${letterCalls.length}`,
        generatedBy: "template",
      };
    },
    async answerQuestion(input: AskInput): Promise<AskResponse> {
      askCalls.push(input);
      return {
        answer: `Answer about ${input.identity.facilityShortName}: ${input.question}`,
        citations: input.review?.findings[0]?.evidence ?? [],
        ruleIds: ["DL11-2024-ART6-1"],
        source: "offline",
      };
    },
  };
}

export const FAKE_RULES: RegulationRule[] = [
  {
    id: "DL11-2024-ART6-1",
    citation: "Decree-Law 11/2024, Art. 6(1)",
    title: "Measure, report and verify emissions",
    summary: "Operators must measure, report and verify their emissions.",
    instrument: "Federal Decree-Law No. 11 of 2024",
    jurisdiction: "UAE federal",
    sourceUrl: "https://uaelegislation.gov.ae/",
    sourceTitle: "UAE Legislation",
    confidence: "secondary",
    tags: ["mrv"],
  },
  {
    id: "EAD-TGD-DATA-GAPS",
    citation: "EAD TGD, data gaps",
    title: "Data gaps",
    summary: "Data gaps must be declared and substituted conservatively.",
    instrument: "EAD Technical Guidance",
    jurisdiction: "Abu Dhabi",
    sourceUrl: "https://www.ead.gov.ae/",
    sourceTitle: "EAD",
    confidence: "secondary",
    tags: ["data_gap"],
  },
];

export const fakeRules: AppDeps["rules"] = {
  list: () => FAKE_RULES,
  get: (id) => FAKE_RULES.find((r) => r.id === id),
};

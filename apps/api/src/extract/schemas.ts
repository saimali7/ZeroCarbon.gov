/**
 * LLM output schemas, one per document kind. They mirror the shared fact types, but every field is
 * required and nullable (strict structured output), and every fact carries its page and a verbatim quote.
 */
import { z } from "zod";

const text = z.string().nullable();
const num = z.union([z.number(), z.string()]).nullable().describe("Plain number, no units or thousands separators; null if not stated");
const date = z.string().nullable().describe("YYYY-MM-DD; null if not stated");
const cite = {
  page: z.number().int().nullable().describe("1-based page number from the '=== Page N ===' markers"),
  quote: z.string().nullable().describe("Verbatim excerpt (max 200 characters) copied exactly from that page, supporting the value"),
};
const citedText = z.object({ value: text, ...cite });
const citedDate = z.object({ value: date, ...cite });
const citedNum = z.object({ value: num, ...cite });

export const calibrationSchema = z.object({
  certificates: z.array(
    z.object({
      tag: z.string().describe("Instrument tag, e.g. FT-3001"),
      service: text,
      certificateNo: text,
      calibratedOn: date,
      nextDue: date,
      result: text.describe("PASS, FAIL, or the result as written"),
      ...cite,
    }),
  ),
});

export const gasAnalysisSchema = z.object({
  reportNo: citedText,
  issuedOn: citedDate,
  samples: z.array(
    z.object({
      sampleId: z.string(),
      samplingPoint: z.string(),
      stream: z.string().describe("fuel | flare | other"),
      sampledOn: date,
      ...cite,
    }),
  ),
  fuelEfMeanTco2PerTj: citedNum.describe("Annual mean CO2 emission factor of fuel gas, t CO2/TJ"),
  fuelNcvMeanMjPerSm3: citedNum.describe("Annual mean net calorific value of fuel gas, MJ/Sm3"),
  flareCo2FactorTPer1000Sm3: citedNum.describe("Mean t CO2 per 10^3 Sm3 of flare gas flared, if stated"),
  flareCh4FactorTPer1000Sm3: citedNum.describe("Mean t CH4 per 10^3 Sm3 of flare gas, if stated"),
});

export const verificationSchema = z.object({
  reference: citedText,
  date: citedDate,
  body: citedText.describe("Name of the verification body"),
  opinion: citedText.describe("unmodified | qualified | adverse | disclaimer | unknown"),
  assuranceLevel: citedText.describe("e.g. Reasonable assurance"),
  materialityPct: citedNum,
  scopeExclusions: z.object({
    ids: z.array(z.string()).describe("Item ids excluded from the verification scope, ranges expanded, e.g. M-04, M-05"),
    ...cite,
  }),
  findings: z.array(
    z.object({
      id: z.string().describe("e.g. F-01"),
      description: z.string(),
      status: z.string().describe("resolved | unresolved | open"),
      impactTco2e: num,
      ...cite,
    }),
  ),
});

export const monitoringPlanSchema = z.object({
  documentNo: citedText,
  revision: citedText.describe("Revision number, e.g. 3.0"),
  date: citedDate,
  statements: z.array(
    z.object({
      topic: z.string().describe("methane_method | tank_venting | data_gap_procedure | reconciliation_control | emission_factor_method | meter_calibration | other"),
      section: text.describe("Section number as written, e.g. 6.3"),
      text: z.string(),
      ...cite,
    }),
  ),
});

export const coverLetterSchema = z.object({
  reference: citedText,
  date: citedDate,
  reportedTotalTco2e: citedNum.describe("Total reported emissions, t CO2e"),
  declarations: z.array(
    z.object({
      claim: z.string().describe("complete_and_accurate | no_data_gaps | verified | other"),
      text: z.string(),
      ...cite,
    }),
  ),
});

export const ldarSchema = z.object({
  contractor: citedText,
  surveys: z.array(
    z.object({
      period: z.string().describe("e.g. Q1"),
      surveyedOn: date,
      componentsSurveyed: num,
      leaksFound: num,
      leaksRepaired: num,
      ch4T: num,
      ...cite,
    }),
  ),
  annualCh4T: citedNum,
});

export type Cited = { value: string | number | null; page: number | null; quote: string | null };
export type CalibrationOutput = z.infer<typeof calibrationSchema>;
export type GasAnalysisOutput = z.infer<typeof gasAnalysisSchema>;
export type VerificationOutput = z.infer<typeof verificationSchema>;
export type MonitoringPlanOutput = z.infer<typeof monitoringPlanSchema>;
export type CoverLetterOutput = z.infer<typeof coverLetterSchema>;
export type LdarOutput = z.infer<typeof ldarSchema>;

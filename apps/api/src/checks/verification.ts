/**
 * Accuracy of the operator's declarations against the verification statement and the breaches found by the
 * other checks. Third-party verification is voluntary until 2027, so a qualified opinion is not a breach in
 * itself; declaring "verified", "complete and accurate" or "no data gaps" against the evidence is.
 */
import type { EvidenceRef, VerifierFindingFact } from "@zerocarbon/shared";
import type { CheckContext, CheckOutput, DraftFinding } from "./context.ts";
import { clip } from "./util.ts";

/** Open non-conformities and misstatements. The classification may only survive in the quoted table row. */
const isSignificantOpen = (f: VerifierFindingFact) => {
  const status = f.status.toLowerCase();
  const classification = `${f.description.slice(0, 40)} ${(f.evidence?.quote ?? "").slice(0, 40)}`;
  if (/unresolved|not resolved|uncorrected/.test(status)) return true;
  if (/closed|resolved|corrected/.test(status)) return false;
  return /open|pending/.test(status) && !/observation|improvement|recommendation/i.test(`${status} ${classification}`);
};

type Claim = "outcome" | "complete" | "no_gaps";

interface Declaration {
  claim: Claim;
  where: string;
  text: string;
  ref?: EvidenceRef;
  contradicted: boolean;
}

export function verificationChecks(ctx: CheckContext, prior: DraftFinding[]): CheckOutput[] {
  return [opinion(ctx, [...new Set(prior)])];
}

function opinion(ctx: CheckContext, prior: DraftFinding[]): CheckOutput {
  const base = { checkId: "verification.opinion", title: "Verification opinion and operator declarations", category: "verification" } as const;
  const v = ctx.facts.verification;
  const { report: r } = ctx;
  if (!v) return { ...base, status: "not_applicable", message: "No verification statement facts extracted", findings: [] };

  const modified = v.opinion === "qualified" || v.opinion === "adverse" || v.opinion === "disclaimer";
  const open = v.findings.filter(isSignificantOpen);
  const exclusions = v.scopeExclusions;
  const breaches = prior.filter((f) => f.outcome === "breach" && (f.severity === "critical" || f.severity === "high"));
  const gapBreach = breaches.some((f) => f.category === "data_gap");

  const declarations: Declaration[] = [];
  const outcome = r.verification.outcome;
  if (outcome && /verified/i.test(outcome) && !/qualif|adverse|disclaim|except/i.test(outcome))
    declarations.push({ claim: "outcome", where: "H1 (b)", text: `"${outcome}"`, ref: r.verification.evidence ?? ctx.reportRef("H1", "(b) Verification"), contradicted: modified });
  if (r.declaration && /complete|accurate|all emissions/i.test(r.declaration.text))
    declarations.push({ claim: "complete", where: "C1", text: `"${clip(r.declaration.text, 180)}"`, ref: r.declaration.evidence, contradicted: breaches.length > 0 });
  if (r.dataGapsDeclaredNone)
    declarations.push({ claim: "no_gaps", where: "H1 (a)", text: "no data gaps", ref: ctx.reportRef("H1", "(a) Data gaps during the reporting period"), contradicted: gapBreach });
  for (const d of ctx.facts.coverLetter?.declarations ?? []) {
    const claim: Claim | undefined = d.claim === "no_data_gaps" ? "no_gaps" : d.claim === "verified" ? "outcome" : d.claim === "complete_and_accurate" ? "complete" : undefined;
    if (!claim) continue;
    const contradicted = claim === "no_gaps" ? gapBreach : claim === "outcome" ? modified : breaches.length > 0;
    declarations.push({ claim, where: "cover letter", text: `"${clip(d.text, 180)}"`, ref: d.evidence, contradicted });
  }
  const contradicted = declarations.filter((d) => d.contradicted);

  if (!modified && !exclusions.length && !open.length && !contradicted.length)
    return {
      ...base,
      status: "pass",
      message: `${v.opinion === "unmodified" ? "Unmodified" : "Verification"} opinion${v.reference ? ` (${v.reference})` : ""}, no scope exclusions, no open non-conformities; declarations consistent with the review`,
      findings: [],
    };

  const breach = contradicted.length > 0;
  const title = breach
    ? modified
      ? `Operator declarations contradict the ${v.opinion} verification opinion`
      : "Operator declarations contradicted by the review findings"
    : modified
      ? `Verification opinion is ${v.opinion}`
      : "Verification scope limited or findings open";

  const where = (claim: Claim) => [...new Set(contradicted.filter((d) => d.claim === claim).map((d) => d.where))].join(", ");
  const outcomeClaim = contradicted.find((d) => d.claim === "outcome");
  const claims = [
    outcomeClaim ? `${outcomeClaim.where} reports the outcome as ${outcomeClaim.text}` : "",
    where("complete") ? `the operator declares the report complete and accurate (${where("complete")})` : "",
    where("no_gaps") ? `with no data gaps (${where("no_gaps")})` : "",
  ].filter(Boolean);
  const opinionText = v.opinion === "unknown" ? "an unclassified" : v.opinion === "adverse" || v.opinion === "unmodified" ? `an ${v.opinion}` : `a ${v.opinion}`;
  const summary = [
    modified || exclusions.length || open.length
      ? `The verifier issued ${opinionText} opinion${v.reference ? ` (${v.reference})` : ""}` +
        (open.length ? ` with ${open.map((f) => f.id).join(", ")} unresolved` : "") +
        (exclusions.length ? ` and excluded ${exclusions.join(", ")} from scope` : "") +
        "."
      : "",
    claims.length ? `Yet ${claims.join(" and ").replace(" and with", " with")}.` : "",
    contradicted.length && breaches.length ? `This review found ${breaches.length} breach${breaches.length > 1 ? "es" : ""} that contradict these declarations.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const finding: DraftFinding = {
    checkId: base.checkId,
    title,
    category: breach ? "declaration" : "verification",
    severity: breach || v.opinion === "adverse" || v.opinion === "disclaimer" ? "high" : "medium",
    outcome: breach ? "breach" : "clarification",
    summary,
    details: [
      `Opinion: ${v.opinion}${v.assuranceLevel ? ` (${v.assuranceLevel}${v.materialityPct !== undefined ? `, materiality ${v.materialityPct}%` : ""})` : ""}.`,
      ...(exclusions.length ? [`Excluded from the verification scope: ${exclusions.join(", ")}.`] : []),
      ...open.map((f) => `Verifier finding ${f.id} (${f.status}): ${clip(f.description, 220)}`),
      ...declarations.map((d) => `${d.contradicted ? "Contradicted" : "Declared"} (${d.where}): ${d.text}.`),
      ...(breaches.length ? [`Breaches found in this review: ${breaches.map((f) => f.title).join("; ")}.`] : []),
      "Third-party verification is voluntary until 2027 (EAD TGD Step 4), so the issue is the accuracy of the operator's declarations, not the lack of an unmodified opinion.",
      "Where verification is carried out, the operator must take account of the verifier's findings and submit a revised report within 30 days of the verifier's notice.",
    ],
    evidence: [...v.evidence, ...open.map((f) => f.evidence), ...contradicted.flatMap((d) => (d.ref ? [d.ref] : []))],
    ruleIds: breach ? ["DL11-2024-ART6-1", "EAD-TGD-VERIFICATION"] : ["EAD-TGD-VERIFICATION"],
    metrics: {
      opinion: v.opinion,
      scopeExclusions: exclusions.length,
      unresolvedFindings: open.length,
      contradictedDeclarations: contradicted.length,
      contradictingBreaches: breaches.length,
    },
  };
  return { ...base, status: "fail", message: finding.summary, findings: [finding] };
}

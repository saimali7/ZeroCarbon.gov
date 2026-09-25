/** Reported emission factors vs the site-specific laboratory values. */
import type { RuleId, SourceStream } from "@zerocarbon/shared";
import {
  MATERIALITY_PCT,
  isFlareStream,
  isPerKSm3,
  pctOfTotal,
  recomputeStreamCo2,
  type CheckContext,
  type CheckOutput,
  type DraftFinding,
} from "./context.ts";
import { clip, fmt, round, sum, withinTolerance } from "./util.ts";

/** Lab certificates state the CO2 emission factor to +/-0.5% (k = 2). */
const EF_TOLERANCE = 0.005;
/** IPCC 2006 default CO2 emission factor for natural gas, t CO2/TJ. */
const IPCC_NATURAL_GAS_EF = 56.1;

export function emissionFactorChecks(ctx: CheckContext): CheckOutput[] {
  return [fuelGasFactor(ctx), flareGasFactor(ctx)];
}

const claimsSiteSpecific = (ctx: CheckContext, s: SourceStream) =>
  /site[- ]specific|tier\s*3|\bGC\b|laborator/i.test([s.factorsBasis, s.tiers, s.dataSource].filter(Boolean).join(" ")) ||
  /site[- ]specific/i.test(ctx.plan("emission_factor_method")?.text ?? "");

function fuelGasFactor(ctx: CheckContext): CheckOutput {
  const base = { checkId: "emission_factor.fuel_gas", title: "Fuel gas emission factor vs lab analysis", category: "emission_factor" } as const;
  const streams = ctx.report.sourceStreams.filter((s) => !isFlareStream(s) && /\/\s*TJ/i.test(s.emissionFactorUnit) && /m3/i.test(s.activityUnit));
  const lab = ctx.facts.gasAnalysis;
  const labEf = lab?.fuelEfMeanTco2PerTj;
  if (!streams.length) return { ...base, status: "not_applicable", message: "No gaseous fuel combustion stream reported", findings: [] };
  if (labEf === undefined) return { ...base, status: "not_applicable", message: "No fuel gas emission factor extracted from a gas analysis certificate", findings: [] };

  const findings: DraftFinding[] = [];
  const ok: string[] = [];
  for (const s of streams) {
    const energy = s.energyTj ?? recomputeStreamCo2(s)?.energyTj;
    if (withinTolerance(s.emissionFactor, labEf, EF_TOLERANCE) || energy === undefined) {
      ok.push(`${s.id} ${fmt(s.emissionFactor, 2)} t CO2/TJ`);
      continue;
    }
    const ox = typeof s.oxidationFactor === "number" ? s.oxidationFactor : 1;
    const recalculated = Math.round(energy * labEf * ox);
    const impact = recalculated - s.co2T;
    const share = pctOfTotal(ctx, impact);
    const material = Math.abs(share) >= MATERIALITY_PCT;
    const siteSpecific = claimsSiteSpecific(ctx, s);
    const isDefault = Math.abs(s.emissionFactor - IPCC_NATURAL_GAS_EF) < 0.005;
    const plan = ctx.plan("emission_factor_method");
    const verifier = ctx.facts.verification?.findings.find((f) => /emission factor/i.test(f.description) && (f.description.includes(s.id) || /fuel gas/i.test(f.description)));
    const labNcv = lab?.fuelNcvMeanMjPerSm3;
    const tierClaim = /tier\s*3/i.test(`${s.factorsBasis ?? ""} ${s.tiers ?? ""}`) ? " (Tier 3)" : "";

    const ruleIds: RuleId[] = ["EAD-TGD-METHODS"];
    if (isDefault) ruleIds.push("IPCC-2006-DEFAULTS");
    ruleIds.push("EAD-TGD-CORRECTIONS");
    if (material) ruleIds.push("DL11-2024-ART6-1");

    findings.push({
      checkId: base.checkId,
      title: `${s.id} ${s.name} emission factor differs from the site-specific lab value`,
      category: "emission_factor",
      severity: material ? "high" : siteSpecific ? "medium" : "low",
      outcome: material ? "breach" : "clarification",
      summary:
        `${s.id} applies ${fmt(s.emissionFactor, 2)} t CO2/TJ${isDefault ? ", the IPCC 2006 default for natural gas," : ""}${siteSpecific ? ` although it is declared site-specific${tierClaim}` : ""}. ` +
        `The lab mean is ${fmt(labEf, 2)} t CO2/TJ, so ${s.id} is ${impact > 0 ? "understated" : "overstated"} by ${fmt(Math.abs(impact))} t CO2 ` +
        `(${fmt(Math.abs(share), 1)}% of the total, ${material ? "above" : "below"} the ${MATERIALITY_PCT}% materiality threshold).`,
      details: [
        `Recalculation: ${fmt(energy, 1)} TJ x ${fmt(labEf, 2)} t CO2/TJ${ox !== 1 ? ` x ${ox}` : ""} = ${fmt(recalculated)} t CO2 vs ${fmt(s.co2T)} t reported.`,
        `Declared basis: "${[s.factorsBasis, s.tiers].filter(Boolean).join("; ")}".`,
        `Lab certificate${lab?.reportNo ? ` ${lab.reportNo}` : ""}: mean fuel gas CO2 emission factor ${fmt(labEf, 2)} t CO2/TJ${lab?.samples.length ? ` (${lab.samples.filter((x) => x.stream === "fuel").length} fuel gas samples)` : ""}.`,
        ...(labNcv !== undefined && s.ncv !== undefined && !withinTolerance(s.ncv, labNcv, EF_TOLERANCE) ? [`NCV ${fmt(s.ncv, 2)} MJ/Sm3 reported vs lab mean ${fmt(labNcv, 2)} MJ/Sm3.`] : []),
        ...(plan ? [`Monitoring Plan section ${plan.section ?? "?"}: "${clip(plan.text, 200)}"`] : []),
        ...(verifier ? [`Verifier finding ${verifier.id} (${verifier.status}) raised the same point: "${clip(verifier.description, 200)}"`] : []),
        "EAD guidance asks for local, technology-specific emission factors where available, with IPCC defaults only as the fallback; a site-specific factor is available here.",
        material
          ? "Above materiality: the reported total is materially misstated."
          : "Below materiality, so treated as a correction request rather than a breach: apply the site-specific factor required by the Monitoring Plan.",
      ],
      evidence: [s.evidence, ctx.reportRef("D1", `row ${s.id}, calculation factors basis`, { rows: s.id }), ...(lab?.evidence ?? []), ...(plan ? [plan.evidence] : []), ...(verifier ? [verifier.evidence] : [])],
      ruleIds,
      impact: {
        tco2e: impact,
        basis: `${fmt(energy, 1)} TJ x (${fmt(labEf, 2)} - ${fmt(s.emissionFactor, 2)}) t CO2/TJ`,
        countsTowardTotal: impact > 0,
      },
      metrics: {
        reportedEf: s.emissionFactor,
        labEf,
        energyTj: energy,
        reportedCo2T: s.co2T,
        recalculatedCo2T: recalculated,
        impactTco2: impact,
        impactPct: round(share, 1),
        ...(verifier ? { verifierFinding: verifier.id } : {}),
      },
    });
  }
  if (!findings.length)
    return { ...base, status: "pass", message: `${ok.join(", ")} matches the lab mean of ${fmt(labEf, 2)} t CO2/TJ${lab?.reportNo ? ` (${lab.reportNo})` : ""}`, findings: [] };
  return { ...base, status: "fail", message: findings.map((f) => f.summary.split(". ")[0]).join("; "), findings };
}

function flareGasFactor(ctx: CheckContext): CheckOutput {
  const base = { checkId: "emission_factor.flare_gas", title: "Flare gas emission factor vs lab analysis", category: "emission_factor" } as const;
  const streams = ctx.report.sourceStreams.filter((s) => isFlareStream(s) && isPerKSm3(s.emissionFactorUnit));
  const labEf = ctx.facts.gasAnalysis?.flareCo2FactorTPer1000Sm3;
  if (!streams.length) return { ...base, status: "not_applicable", message: "No flare stream with a volumetric emission factor", findings: [] };
  if (labEf === undefined) return { ...base, status: "not_applicable", message: "No flare gas CO2 factor extracted from a gas analysis certificate", findings: [] };

  const off = streams.filter((s) => !withinTolerance(s.emissionFactor, labEf, EF_TOLERANCE));
  const ids = streams.map((s) => s.id).join(", ");
  if (!off.length)
    return { ...base, status: "pass", message: `${ids} flare EF ${fmt(streams[0].emissionFactor, 3)} t CO2/10^3 Sm3 matches the lab mean (${fmt(labEf, 3)})`, findings: [] };

  const impact = Math.round(sum(off.map((s) => (s.activity / 1000) * labEf - s.co2T)));
  const share = pctOfTotal(ctx, impact);
  const material = Math.abs(share) >= MATERIALITY_PCT;
  const finding: DraftFinding = {
    checkId: base.checkId,
    title: "Flare gas emission factor differs from the lab value",
    category: "emission_factor",
    severity: material ? "high" : "medium",
    outcome: material ? "breach" : "clarification",
    summary: `${off.map((s) => `${s.id} uses ${fmt(s.emissionFactor, 3)}`).join(", ")} t CO2/10^3 Sm3 against a lab mean of ${fmt(labEf, 3)}; the difference is ${fmt(impact)} t CO2 (${fmt(share, 1)}% of the total).`,
    details: off.map((s) => `${s.id}: ${fmt(s.activity)} Sm3 / 1000 x ${fmt(labEf, 3)} = ${fmt((s.activity / 1000) * labEf)} t CO2 vs ${fmt(s.co2T)} t reported.`),
    evidence: [...off.map((s) => s.evidence), ...(ctx.facts.gasAnalysis?.evidence ?? [])],
    ruleIds: ["EAD-TGD-METHODS", "EAD-TGD-CORRECTIONS"],
    impact: { tco2e: impact, basis: "Flare volume x (lab factor - reported factor)", countsTowardTotal: impact > 0 },
    metrics: { labEf, impactTco2: impact },
  };
  return { ...base, status: "fail", message: finding.summary, findings: [finding] };
}

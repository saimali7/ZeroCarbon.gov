"use client";

import { ArrowSquareOut, Scales } from "@phosphor-icons/react";
import type { RegulationRule } from "@zerocarbon/shared";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../../_lib/api";
import { Popover } from "./popover";

type RulesState = { rules: RegulationRule[]; byId: Map<string, RegulationRule>; status: "loading" | "ready" | "error" };

const RulesContext = createContext<RulesState>({ rules: [], byId: new Map(), status: "loading" });

/** Loads the regulations corpus once so any component can render citations. */
export function RulesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RulesState>({ rules: [], byId: new Map(), status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    api
      .regulations(controller.signal)
      .then((rules) => setState({ rules, byId: new Map(rules.map((r) => [r.id, r])), status: "ready" }))
      .catch(() => {
        if (!controller.signal.aborted) setState((s) => ({ ...s, status: "error" }));
      });
    return () => controller.abort();
  }, []);
  return <RulesContext.Provider value={state}>{children}</RulesContext.Provider>;
}

export function useRules() {
  return useContext(RulesContext);
}

/** Citation chip for a rule id. Opens the rule's plain-language summary and source link. */
export function RuleChip({ ruleId, className = "" }: { ruleId: string; className?: string }) {
  const { byId } = useRules();
  const rule = byId.get(ruleId);
  const label = rule?.citation ?? ruleId;
  return (
    <Popover
      label={rule?.title ?? ruleId}
      trigger={({ open, toggle, id }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={open ? id : undefined}
          className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border border-gold-200 bg-gold-50 px-2.5 text-xs font-medium text-gold-800 transition-colors hover:border-gold-300 hover:bg-gold-100 ${className}`}
        >
          <Scales size={13} weight="bold" aria-hidden />
          {label}
        </button>
      )}
    >
      <RuleDetail rule={rule} ruleId={ruleId} />
    </Popover>
  );
}

function RuleDetail({ rule, ruleId }: { rule?: RegulationRule; ruleId: string }) {
  if (!rule) return <p className="text-ink-muted">Rule {ruleId} is not in the regulations corpus.</p>;
  return (
    <span className="flex flex-col gap-2">
      <span className="text-xs font-medium text-gold-700">{rule.citation}</span>
      <span className="text-[15px] font-semibold leading-snug">{rule.title}</span>
      <span className="leading-relaxed text-ink-2">{rule.summary}</span>
      {rule.titleAr && (
        <span lang="ar" dir="rtl" className="text-[13px] leading-relaxed text-ink-muted">
          {rule.titleAr}
        </span>
      )}
      <span className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-xs text-ink-muted">
        <span>
          {rule.instrument}
          {rule.confidence === "secondary" && " · secondary source"}
        </span>
        <a
          href={rule.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium text-gold-700 underline-offset-2 hover:underline"
        >
          Source
          <ArrowSquareOut size={12} weight="bold" aria-hidden />
        </a>
      </span>
    </span>
  );
}

export function RuleChips({ ruleIds, className = "" }: { ruleIds: string[]; className?: string }) {
  const unique = useMemo(() => [...new Set(ruleIds)], [ruleIds]);
  if (unique.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {unique.map((id) => (
        <RuleChip key={id} ruleId={id} />
      ))}
    </div>
  );
}

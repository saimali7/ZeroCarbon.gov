"use client";

import { ArrowSquareOut, Info, MagnifyingGlass, Scales, SealCheck } from "@phosphor-icons/react";
import type { RegulationRule } from "@zerocarbon/shared";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { api } from "../../_lib/api";
import { formatInt } from "../../_lib/format";
import { Button } from "../../_components/ui/button";
import { Card, PageHeading } from "../../_components/ui/card";
import { Pill } from "../../_components/ui/pill";
import { useRules } from "../../_components/ui/rules";
import { EmptyState, ErrorState, Notice, Skeleton } from "../../_components/ui/states";

type Jurisdiction = RegulationRule["jurisdiction"];
type Group = { jurisdiction: Jurisdiction; instruments: { name: string; slug: string; rules: RegulationRule[] }[] };

const JURISDICTIONS: { value: Jurisdiction; description: string }[] = [
  { value: "UAE federal", description: "Federal law and Cabinet resolutions." },
  { value: "Abu Dhabi", description: "Environment Agency - Abu Dhabi (EAD) programme rules and technical guidance." },
  { value: "International", description: "IPCC methods and values used in the calculations." },
];

const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Every word of the query must appear in one of the rule's text fields or tags. */
function matches(rule: RegulationRule, query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = [rule.id, rule.citation, rule.title, rule.titleAr, rule.summary, rule.summaryAr, rule.instrument, ...rule.tags]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return words.every((w) => haystack.includes(w));
}

/** Jurisdiction, then instrument, keeping corpus order within each. */
function groupRules(rules: RegulationRule[]): Group[] {
  const order = [...JURISDICTIONS.map((j) => j.value), ...rules.map((r) => r.jurisdiction)];
  const jurisdictions = [...new Set(order)].filter((j) => rules.some((r) => r.jurisdiction === j));
  return jurisdictions.map((jurisdiction) => {
    const inJurisdiction = rules.filter((r) => r.jurisdiction === jurisdiction);
    const names = [...new Set(inJurisdiction.map((r) => r.instrument))];
    return {
      jurisdiction,
      instruments: names.map((name) => ({ name, slug: `instrument-${slug(name)}`, rules: inJurisdiction.filter((r) => r.instrument === name) })),
    };
  });
}

/** The shared corpus from `useRules()`, with a local refetch when the first load failed. */
function useCorpus() {
  const shared = useRules();
  const [retried, setRetried] = useState<{ status: "loading" | "ready" | "error"; rules: RegulationRule[] } | null>(null);
  const retry = useCallback(() => {
    setRetried({ status: "loading", rules: [] });
    api.regulations().then(
      (rules) => setRetried({ status: "ready", rules }),
      () => setRetried({ status: "error", rules: [] }),
    );
  }, []);
  const state = retried ?? shared;
  return { status: state.status, rules: state.rules, retry };
}

function readHash() {
  try {
    return decodeURIComponent(window.location.hash.slice(1));
  } catch {
    return "";
  }
}

const subscribeHash = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

export function RegulationsCorpus() {
  const { status, rules, retry } = useCorpus();
  const [query, setQuery] = useState("");
  const hash = useSyncExternalStore(subscribeHash, readHash, () => "");

  const filtered = useMemo(() => rules.filter((r) => matches(r, query)), [rules, query]);
  const groups = useMemo(() => groupRules(filtered), [filtered]);

  // Content arrives after navigation, so scroll to a deep-linked rule once it exists.
  useEffect(() => {
    if (status === "ready" && hash) document.getElementById(hash)?.scrollIntoView({ block: "start" });
  }, [status, hash]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeading
        title="Regulations"
        description="The rules behind every check. Each finding, letter and answer cites one or more of these rules, so an officer can see the legal basis in one click."
      />
      <Notice tone="neutral" className="flex w-fit max-w-3xl items-start gap-2.5">
        <Info size={18} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
        <span>
          Summaries are plain-language paraphrases, not the official text. Follow the source link for the authoritative wording.
        </span>
      </Notice>

      {status === "loading" && <CorpusSkeleton />}
      {status === "error" && <ErrorState title="Could not load the regulations" message="The regulations corpus did not load." onRetry={retry} />}
      {status === "ready" && rules.length === 0 && (
        <EmptyState icon={<Scales size={20} weight="duotone" aria-hidden />} title="No rules in the corpus" description="The regulations corpus is empty, so findings cannot cite a legal basis." />
      )}

      {status === "ready" && rules.length > 0 && (
        <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <nav aria-label="Instruments" className="sticky top-6 flex flex-col gap-5">
              {groups.map((g) => (
                <div key={g.jurisdiction}>
                  <p className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted">{g.jurisdiction}</p>
                  <ul className="mt-2 flex flex-col gap-0.5 border-l border-line">
                    {g.instruments.map((inst) => (
                      <li key={inst.slug}>
                        <a
                          href={`#${inst.slug}`}
                          className="-ml-px flex items-start justify-between gap-3 border-l-2 border-transparent py-1.5 pl-3 pr-1 text-[13px] leading-snug text-ink-2 transition-colors hover:border-gold-500 hover:text-ink"
                        >
                          <span>{inst.name}</span>
                          <span className="tabular-nums text-ink-faint">{inst.rules.length}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </aside>

          <div className="flex min-w-0 flex-col gap-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="w-full max-w-md">
                <label htmlFor="rule-search" className="text-sm font-medium">
                  Search rules
                </label>
                <div className="relative mt-1.5">
                  <MagnifyingGlass size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                  <input
                    id="rule-search"
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="For example: methane, data gaps, penalty"
                    autoComplete="off"
                    className="h-10 w-full rounded-field border border-line-strong bg-surface pl-9 pr-3 text-sm transition-colors placeholder:text-ink-faint hover:border-ink-faint focus-visible:border-gold-500"
                  />
                </div>
              </div>
              <p aria-live="polite" className="text-[13px] text-ink-muted tabular-nums">
                {query.trim()
                  ? `${formatInt(filtered.length)} of ${formatInt(rules.length)} rules match`
                  : `${formatInt(rules.length)} rules from ${formatInt(new Set(rules.map((r) => r.instrument)).size)} instruments`}
              </p>
            </div>

            {groups.length === 0 && (
              <div className="flex flex-col items-start gap-3 rounded-card border border-dashed border-line-strong bg-surface px-6 py-8">
                <div>
                  <p className="text-[15px] font-semibold">No rules match &ldquo;{query.trim()}&rdquo;</p>
                  <p className="mt-0.5 text-sm text-ink-muted">Try a shorter term or a tag such as &ldquo;methane&rdquo; or &ldquo;deadline&rdquo;.</p>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setQuery("")}>
                  Clear search
                </Button>
              </div>
            )}

            {groups.map((g) => (
              <section key={g.jurisdiction} aria-labelledby={`jurisdiction-${slug(g.jurisdiction)}`} className="flex flex-col gap-4">
                <div>
                  <h2 id={`jurisdiction-${slug(g.jurisdiction)}`} className="text-xl font-bold tracking-tight">
                    {g.jurisdiction}
                  </h2>
                  <p className="mt-0.5 text-sm text-ink-muted">{JURISDICTIONS.find((j) => j.value === g.jurisdiction)?.description}</p>
                </div>
                {g.instruments.map((inst) => (
                  <Card key={inst.slug} id={inst.slug} aria-labelledby={`${inst.slug}-title`} className="scroll-mt-6">
                    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
                      <h3 id={`${inst.slug}-title`} className="text-base font-semibold leading-snug">
                        {inst.name}
                      </h3>
                      <span className="shrink-0 pt-0.5 text-[13px] tabular-nums text-ink-muted">
                        {inst.rules.length} {inst.rules.length === 1 ? "rule" : "rules"}
                      </span>
                    </div>
                    <div className="divide-y divide-line">
                      {inst.rules.map((rule) => (
                        <RuleItem key={rule.id} rule={rule} highlighted={hash === `rule-${rule.id}`} />
                      ))}
                    </div>
                  </Card>
                ))}
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RuleItem({ rule, highlighted }: { rule: RegulationRule; highlighted: boolean }) {
  const hasArabic = Boolean(rule.titleAr || rule.summaryAr);
  return (
    <article
      id={`rule-${rule.id}`}
      aria-labelledby={`rule-${rule.id}-title`}
      className={`relative scroll-mt-6 px-5 py-5 transition-colors duration-300 last:rounded-b-card ${
        highlighted ? "bg-gold-50 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-gold-500" : ""
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <a href={`#rule-${rule.id}`} className="text-[13px] font-semibold text-gold-700 underline-offset-2 hover:underline">
          {rule.citation}
        </a>
        <span className="font-mono text-xs text-ink-faint">{rule.id}</span>
      </div>
      <div className={`mt-1.5 grid gap-x-8 gap-y-3 ${hasArabic ? "lg:grid-cols-2" : ""}`}>
        <div className="min-w-0">
          <h4 id={`rule-${rule.id}-title`} className="text-base font-semibold leading-snug">
            {rule.title}
          </h4>
          <p className="mt-1.5 max-w-[70ch] text-[15px] leading-relaxed text-ink-2 text-pretty">{rule.summary}</p>
        </div>
        {hasArabic && (
          <div lang="ar" dir="rtl" className="min-w-0 rounded-control bg-sunken px-4 py-3">
            {rule.titleAr && <p className="text-[15px] font-semibold leading-relaxed">{rule.titleAr}</p>}
            {rule.summaryAr && <p className="mt-1 text-sm leading-loose text-ink-2">{rule.summaryAr}</p>}
          </div>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        {rule.tags.length > 0 && (
          <ul aria-label="Tags" className="flex flex-wrap gap-1.5">
            {rule.tags.map((tag) => (
              <li key={tag}>
                <Pill size="sm">{tag}</Pill>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
          {rule.confidence === "verified" ? (
            <span className="inline-flex items-center gap-1.5 text-ok-700">
              <SealCheck size={16} weight="duotone" aria-hidden />
              Verified against source
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-gold-800">
              <Info size={16} weight="duotone" aria-hidden />
              Secondary source: confirm against the official text before relying on it
            </span>
          )}
          <a
            href={rule.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-gold-700 underline-offset-2 hover:underline"
          >
            {rule.sourceTitle}
            <ArrowSquareOut size={13} weight="bold" aria-hidden className="ml-1 inline-block align-[-2px]" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      </div>
    </article>
  );
}

function CorpusSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading regulations" className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
      <div className="hidden flex-col gap-3 lg:flex">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-52" />
        <Skeleton className="h-4 w-44" />
        <Skeleton className="mt-3 h-3 w-24" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-full max-w-md rounded-field" />
        {[0, 1].map((i) => (
          <Card key={i}>
            <div className="border-b border-line px-5 py-4">
              <Skeleton className="h-4 w-80 max-w-full" />
            </div>
            {[0, 1].map((j) => (
              <div key={j} className="flex flex-col gap-2.5 border-b border-line px-5 py-5 last:border-b-0">
                <Skeleton className="h-3 w-40" />
                <Skeleton className="h-4 w-64 max-w-full" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-3/4" />
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}

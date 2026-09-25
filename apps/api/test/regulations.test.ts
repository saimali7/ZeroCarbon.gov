import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { RuleId } from "@zerocarbon/shared";
import { getRule, getRules, isKnownRule, listRules, searchRules } from "../src/regulations/index.ts";

/** Every id in the shared RuleId union. The type checks below fail to compile if this list drifts from the union. */
const RULE_IDS = [
  "DL11-2024-ART6-1",
  "DL11-2024-ART15",
  "DL11-2024-ART16",
  "DL11-2024-ART17",
  "DL11-2024-ART18",
  "CR67-2024-REGISTRY",
  "EAD-MRV-SCOPE",
  "EAD-MRV-DEADLINE",
  "EAD-TGD-MP-UPDATE",
  "EAD-TGD-COMPLETENESS",
  "EAD-TGD-DATA-GAPS",
  "EAD-TGD-CATEGORIES",
  "EAD-TGD-TIERS",
  "EAD-TGD-FALLBACK",
  "EAD-TGD-METHODS",
  "EAD-TGD-VERIFICATION",
  "EAD-TGD-CORRECTIONS",
  "EAD-TGD-INSPECTION",
  "IPCC-2006-DEFAULTS",
  "IPCC-AR5-GWP",
] as const satisfies readonly RuleId[];

// Compile-time exhaustiveness: every RuleId must appear in RULE_IDS.
type MissingRuleIds = Exclude<RuleId, (typeof RULE_IDS)[number]>;
const allRuleIdsListed: [MissingRuleIds] extends [never] ? true : MissingRuleIds = true;
void allRuleIdsListed;

/** Ids in the corpus that are not (yet) in the shared union. Keep in sync with the corpus and report them. */
const EXTRA_IDS: string[] = [];

const ARABIC = /[\u0600-\u06FF]/;

test("every RuleId in the shared union has exactly one corpus entry", () => {
  const rules = listRules();
  for (const id of RULE_IDS) {
    const count = rules.filter((r) => r.id === id).length;
    assert.equal(count, 1, `expected exactly one entry for ${id}, found ${count}`);
    assert.ok(isKnownRule(id));
    assert.equal(getRule(id)?.id, id);
  }
});

test("rule ids are unique and extras are documented", () => {
  const ids = listRules().map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate ids");
  const known = new Set<string>(RULE_IDS);
  const extras = ids.filter((id) => !known.has(id));
  assert.deepEqual(extras.sort(), [...EXTRA_IDS].sort());
});

test("the module serves the whole JSON file", () => {
  const raw = JSON.parse(readFileSync(new URL("../data/regulations.json", import.meta.url), "utf8")) as unknown[];
  assert.equal(listRules().length, raw.length);
});

test("every rule has an https source, Arabic fields, valid confidence and tags", () => {
  for (const rule of listRules()) {
    assert.equal(new URL(rule.sourceUrl).protocol, "https:", `${rule.id} sourceUrl`);
    assert.ok(rule.sourceTitle.length > 0, `${rule.id} sourceTitle`);
    assert.ok(rule.titleAr && ARABIC.test(rule.titleAr), `${rule.id} titleAr must contain Arabic script`);
    assert.ok(rule.summaryAr && ARABIC.test(rule.summaryAr), `${rule.id} summaryAr must contain Arabic script`);
    assert.ok(rule.confidence === "verified" || rule.confidence === "secondary", `${rule.id} confidence`);
    assert.ok(["UAE federal", "Abu Dhabi", "International"].includes(rule.jurisdiction), `${rule.id} jurisdiction`);
    assert.ok(rule.tags.length > 0, `${rule.id} tags`);
    assert.ok(rule.summary.length >= 100, `${rule.id} summary is too short`);
  }
});

test("corpus text contains no em or en dashes", () => {
  for (const rule of listRules()) {
    for (const [field, value] of Object.entries(rule)) {
      assert.doesNotMatch(JSON.stringify(value), /[\u2013\u2014]/, `${rule.id}.${field}`);
    }
  }
});

test("searchRules ranks the data gaps rule first for 'data gap'", () => {
  const hits = searchRules("data gap");
  assert.ok(hits.length > 0);
  assert.equal(hits[0]?.id, "EAD-TGD-DATA-GAPS");
});

test("searchRules finds other rules by keyword, including Arabic", () => {
  assert.equal(searchRules("de minimis")[0]?.id, "EAD-TGD-CATEGORIES");
  assert.equal(searchRules("fallback uncertainty")[0]?.id, "EAD-TGD-FALLBACK");
  assert.equal(searchRules("methane GWP")[0]?.id, "IPCC-AR5-GWP");
  assert.equal(searchRules("DEADLINE 31 March")[0]?.id, "EAD-MRV-DEADLINE");
  assert.equal(searchRules("repeat offence")[0]?.id, "DL11-2024-ART16");
  assert.equal(searchRules("فجوات البيانات")[0]?.id, "EAD-TGD-DATA-GAPS");
});

test("searchRules respects the limit and ignores empty queries", () => {
  assert.ok(searchRules("emissions").length <= 5);
  assert.equal(searchRules("emissions", 2).length, 2);
  assert.deepEqual(searchRules(""), []);
  assert.deepEqual(searchRules("   "), []);
  assert.deepEqual(searchRules("zzqxv"), []);
});

test("getRules preserves the requested order and skips unknown ids", () => {
  const ids = ["IPCC-AR5-GWP", "NOT-A-RULE", "DL11-2024-ART15", "EAD-TGD-DATA-GAPS"];
  assert.deepEqual(
    getRules(ids).map((r) => r.id),
    ["IPCC-AR5-GWP", "DL11-2024-ART15", "EAD-TGD-DATA-GAPS"],
  );
  assert.equal(getRule("NOT-A-RULE"), undefined);
  assert.equal(isKnownRule("NOT-A-RULE"), false);
});

test("corpus objects are read-only", () => {
  const rule = getRule("DL11-2024-ART15");
  assert.ok(rule && Object.isFrozen(rule));
  const copy = listRules();
  copy.pop();
  assert.equal(listRules().length, copy.length + 1, "listRules returns a copy");
});

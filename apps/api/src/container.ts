import { readFileSync } from "node:fs";
import type { AiMode } from "@zerocarbon/shared";
import { answerQuestion, draftLetter, findObservations, writeNarrative } from "./ai/index.ts";
import { createOpenRouterClient } from "./ai/openrouter.ts";
import { createApp } from "./app.ts";
import { createCatalog } from "./catalog.ts";
import { runChecks } from "./checks/index.ts";
import { config } from "./config.ts";
import { extractDocumentFacts } from "./extract/index.ts";
import { getRule, listRules } from "./regulations/index.ts";
import { createPipeline } from "./review/pipeline.ts";
import { scoreReview } from "./review/scoring.ts";
import { createStore } from "./store/store.ts";
import type { AiContext } from "./types.ts";

export const version: string = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;

/** Wires every module together. Used by the server and by scripts. */
export function createContainer(options: { aiMode?: AiMode; writeCache?: boolean } = {}) {
  const aiMode = options.aiMode ?? config.aiMode;
  const live = aiMode === "live" && config.openRouter.apiKey.length > 0;
  const ai: AiContext = {
    mode: live ? "live" : "demo",
    client: live ? createOpenRouterClient(config.openRouter) : undefined,
    cacheDir: config.aiCacheDir,
    writeCache: options.writeCache,
  };
  const catalog = createCatalog({ dataDir: config.dataDir, storeDir: config.storeDir });
  const pipeline = createPipeline({
    catalog,
    ai,
    rules: listRules,
    extractFacts: extractDocumentFacts,
    runChecks,
    scoreReview,
    writeNarrative,
    findObservations,
  });
  const aiServices = {
    draftLetter: (input: Parameters<typeof draftLetter>[0]) => draftLetter(input, ai),
    answerQuestion: (input: Parameters<typeof answerQuestion>[0]) => answerQuestion(input, ai),
  };
  return { ai, catalog, pipeline, aiServices, model: live ? config.openRouter.model : undefined };
}

export function createServerApp() {
  const container = createContainer();
  const store = createStore(config.storeDir);
  const app = createApp({
    version,
    aiMode: container.ai.mode,
    model: container.model,
    maxUploadMb: config.maxUploadMb,
    catalog: container.catalog,
    pipeline: container.pipeline,
    store,
    ai: container.aiServices,
    rules: { list: listRules, get: getRule },
  });
  return { app, store, container };
}

import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AiMode } from "@zerocarbon/shared";

const env = process.env;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function resolveAiMode(requested: string, hasKey: boolean): AiMode {
  if (requested === "demo") return "demo";
  if (requested === "live" && !hasKey) {
    console.warn("[config] AI_MODE=live but OPENROUTER_API_KEY is empty. Falling back to demo mode.");
    return "demo";
  }
  return hasKey ? "live" : "demo";
}

const openRouterApiKey = env.OPENROUTER_API_KEY?.trim() ?? "";

export const config = {
  port: Number(env.PORT || env.API_PORT) || 4000,
  host: env.HOST || "127.0.0.1",
  repoRoot,
  /** Demo submission packages and simulated regulator reference data. */
  dataDir: path.resolve(repoRoot, env.DATA_DIR || "demo"),
  /** Runtime state: reviews, decisions, letters, uploads. Gitignored. */
  storeDir: path.resolve(repoRoot, env.STORE_DIR || ".data"),
  /** Committed AI outputs replayed in demo mode. */
  aiCacheDir: path.resolve(repoRoot, env.AI_CACHE_DIR || "apps/api/data/ai-cache"),
  aiMode: resolveAiMode((env.AI_MODE || "auto").trim().toLowerCase(), openRouterApiKey.length > 0),
  openRouter: {
    apiKey: openRouterApiKey,
    baseUrl: (env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, ""),
    model: env.OPENROUTER_MODEL?.trim() || "google/gemini-3.8-flash",
    fallbackModels: (env.OPENROUTER_FALLBACK_MODELS || "")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
    timeoutMs: Number(env.OPENROUTER_TIMEOUT_MS) || 120_000,
    appUrl: env.OPENROUTER_APP_URL || "https://github.com/saimali7/ZeroCarbon.gov",
    appName: "ZeroCarbon.gov",
  },
  maxUploadMb: Number(env.MAX_UPLOAD_MB) || 50,
} as const;

export type AppConfig = typeof config;

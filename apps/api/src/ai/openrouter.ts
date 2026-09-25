/**
 * Minimal OpenRouter client (OpenAI-compatible chat completions API).
 * https://openrouter.ai/docs/api-reference/chat-completion
 *
 * - Structured output via response_format json_schema (built from a zod schema),
 *   validated again with zod on our side.
 * - Retries on 429/5xx and on invalid JSON, falls back to prompt-only JSON when
 *   a provider rejects response_format.
 * - Never logs or returns the API key.
 */
import { z } from "zod";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Override the default model for this call. */
  model?: string;
  signal?: AbortSignal;
}

export interface ChatResult {
  content: string;
  model: string;
  usage?: { promptTokens?: number; completionTokens?: number; cost?: number };
}

export interface JsonChatOptions<T> extends ChatOptions {
  schema: z.ZodType<T>;
  /** Name for the JSON schema (letters, digits, underscores). */
  schemaName: string;
}

export interface OpenRouterClient {
  readonly model: string;
  chat(options: ChatOptions): Promise<ChatResult>;
  chatJson<T>(options: JsonChatOptions<T>): Promise<ChatResult & { data: T }>;
}

export interface OpenRouterConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  fallbackModels?: string[];
  timeoutMs: number;
  appUrl?: string;
  appName?: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

export class OpenRouterError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "OpenRouterError";
  }
}

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** JSON schema for response_format, from a zod schema. */
export function toResponseSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
  return jsonSchema;
}

/** Extract a JSON value from model output that may be wrapped in a code fence or prose. */
export function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.search(/[[{]/);
    const end = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new OpenRouterError("Model did not return valid JSON");
  }
}

export function createOpenRouterClient(cfg: OpenRouterConfig): OpenRouterClient {
  const doFetch = cfg.fetchImpl ?? fetch;

  async function request(body: Record<string, unknown>, signal?: AbortSignal): Promise<ChatResult> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await sleep(800 * 2 ** (attempt - 1));
      const timeout = AbortSignal.timeout(cfg.timeoutMs);
      try {
        const res = await doFetch(`${cfg.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${cfg.apiKey}`,
            "Content-Type": "application/json",
            ...(cfg.appUrl ? { "HTTP-Referer": cfg.appUrl } : {}),
            ...(cfg.appName ? { "X-Title": cfg.appName } : {}),
          },
          body: JSON.stringify(body),
          signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        });
        const text = await res.text();
        let json: any;
        try {
          json = JSON.parse(text);
        } catch {
          json = undefined;
        }
        if (!res.ok || json?.error) {
          const status = json?.error?.code && Number.isInteger(json.error.code) ? json.error.code : res.status;
          const message = json?.error?.message ?? `OpenRouter request failed with status ${res.status}`;
          lastError = new OpenRouterError(message, status);
          if (RETRYABLE.has(status)) continue;
          throw lastError;
        }
        const message = json?.choices?.[0]?.message;
        const content = Array.isArray(message?.content)
          ? message.content.map((part: any) => part?.text ?? "").join("")
          : (message?.content ?? "");
        if (!content) {
          lastError = new OpenRouterError("OpenRouter returned an empty response");
          continue;
        }
        return {
          content,
          model: json.model ?? String(body.model),
          usage: {
            promptTokens: json.usage?.prompt_tokens,
            completionTokens: json.usage?.completion_tokens,
            cost: json.usage?.cost,
          },
        };
      } catch (err) {
        if (err instanceof OpenRouterError && err.status && !RETRYABLE.has(err.status)) throw err;
        if (signal?.aborted) throw err;
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new OpenRouterError(String(lastError));
  }

  function baseBody(options: ChatOptions): Record<string, unknown> {
    const model = options.model ?? cfg.model;
    const fallbacks = options.model ? [] : (cfg.fallbackModels ?? []);
    return {
      model,
      ...(fallbacks.length ? { models: [model, ...fallbacks] } : {}),
      messages: options.messages,
      temperature: options.temperature ?? 0.2,
      ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
    };
  }

  return {
    model: cfg.model,

    chat(options) {
      return request(baseBody(options), options.signal);
    },

    async chatJson<T>(options: JsonChatOptions<T>) {
      const jsonSchema = toResponseSchema(options.schema);
      const structured = {
        ...baseBody(options),
        response_format: {
          type: "json_schema",
          json_schema: { name: options.schemaName, strict: true, schema: jsonSchema },
        },
        provider: { require_parameters: true },
      };
      const promptOnly = {
        ...baseBody({
          ...options,
          messages: [
            ...options.messages,
            {
              role: "user",
              content: `Respond with only a JSON object that matches this JSON Schema, with no other text:\n${JSON.stringify(jsonSchema)}`,
            },
          ],
        }),
      };

      let result: ChatResult;
      try {
        result = await request(structured, options.signal);
      } catch (err) {
        // Some providers reject response_format or require_parameters (400/404): retry with the schema in the prompt.
        if (err instanceof OpenRouterError && (err.status === 400 || err.status === 404)) {
          result = await request(promptOnly, options.signal);
        } else throw err;
      }

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const parsed = options.schema.safeParse(parseJsonContent(result.content));
          if (parsed.success) return { ...result, data: parsed.data };
          if (attempt === 1) throw new OpenRouterError(`Model output did not match schema: ${z.prettifyError(parsed.error)}`);
        } catch (err) {
          if (attempt === 1) throw err;
        }
        result = await request(promptOnly, options.signal);
      }
      throw new OpenRouterError("Unreachable");
    },
  };
}

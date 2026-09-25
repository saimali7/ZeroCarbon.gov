import type { ErrorRequestHandler } from "express";
import { z } from "zod";
import type { ApiError } from "@zerocarbon/shared";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Parse request input with a zod schema; throws HttpError(400) with readable issues. */
export function parseInput<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new HttpError(400, "Invalid request", result.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`));
  }
  return result.data;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details } satisfies ApiError);
    return;
  }
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Malformed JSON body" } satisfies ApiError);
    return;
  }
  console.error("[api]", err);
  res.status(500).json({ error: "Internal server error" } satisfies ApiError);
};

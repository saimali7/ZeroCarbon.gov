import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AiContext } from "../types.ts";
import { errorMessage, warn } from "./format.ts";

export type CacheKind = "narrative" | "letter" | "observations" | "facts";

/** Safe file name for a cache key: kept as is when simple, otherwise hashed. */
export function cacheKey(key: string): string {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(key) ? key : createHash("sha256").update(key).digest("hex").slice(0, 32);
}

export const cachePath = (ctx: Pick<AiContext, "cacheDir">, kind: CacheKind, key: string) =>
  path.join(ctx.cacheDir, kind, `${cacheKey(key)}.json`);

export async function readCache<T>(ctx: Pick<AiContext, "cacheDir">, kind: CacheKind, key: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(cachePath(ctx, kind, key), "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") warn(`cache ${kind}/${key} unreadable: ${errorMessage(err)}`);
    return undefined;
  }
}

export async function writeCache(ctx: Pick<AiContext, "cacheDir">, kind: CacheKind, key: string, value: unknown): Promise<void> {
  const file = cachePath(ctx, kind, key);
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(tmp, file);
}

/** Write when ctx.writeCache is set; never throws (a failed snapshot must not discard a good AI result). */
export async function maybeWriteCache(ctx: AiContext, kind: CacheKind, key: string, value: unknown): Promise<void> {
  if (!ctx.writeCache) return;
  try {
    await writeCache(ctx, kind, key, value);
  } catch (err) {
    warn(`cache ${kind}/${key} not written: ${errorMessage(err)}`);
  }
}

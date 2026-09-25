import type { NextRequest } from "next/server";

// Forwards /api/* to the Node API. Read at request time, so the launcher can
// pick any free API port without rebuilding the web app.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://127.0.0.1:4000";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-encoding",
  "content-length",
  // Node's fetch rejects "Expect: 100-continue" (sent by curl and some clients for large uploads).
  "expect",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function forwardableHeaders(source: Headers) {
  const headers = new Headers();
  source.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });
  return headers;
}

async function proxy(request: NextRequest, ctx: RouteContext<"/api/[...path]">) {
  const { path } = await ctx.params;
  const target = new URL(`/api/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`, BACKEND_URL);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers: forwardableHeaders(request.headers),
    body: hasBody ? request.body : undefined,
    duplex: hasBody ? "half" : undefined,
    redirect: "manual",
    cache: "no-store",
    signal: request.signal,
  };

  try {
    const upstream = await fetch(target, init);
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: forwardableHeaders(upstream.headers),
    });
  } catch {
    return Response.json({ error: "API server is not reachable" }, { status: 502 });
  }
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };

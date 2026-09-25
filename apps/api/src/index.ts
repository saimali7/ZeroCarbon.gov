import { config } from "./config.ts";
import { createServerApp } from "./container.ts";

const { app, store, container } = createServerApp();

const server = app.listen(config.port, config.host, () => {
  const ai = container.ai.mode === "live" ? `live, OpenRouter ${container.model}` : "demo, offline";
  console.log(`API listening on http://${config.host}:${config.port} (AI mode: ${ai})`);
  // Warm the catalog so the first inbox request is fast.
  container.catalog.list().catch((err) => console.warn("[api] catalog warm-up failed:", err.message));
});

server.on("error", (err) => {
  console.error("[api] failed to start:", err.message);
  process.exit(1);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    const exit = () => store.flush().finally(() => process.exit(0));
    server.close(exit);
    setTimeout(exit, 2000).unref();
  });
}

import { Router } from "express";
import type { HealthResponse } from "@zerocarbon/shared";
import type { AppDeps } from "../app.ts";
import { HttpError, parseInput } from "../lib/http.ts";
import { nowIso, recordAudit } from "../services/audit.ts";
import { buildDashboard } from "../services/dashboard.ts";
import { buildMap } from "../services/map.ts";
import type { ReviewRunner } from "../services/review-runner.ts";
import { auditQuery, resetRequest } from "./schemas.ts";

export function systemRouter(deps: AppDeps, runner: ReviewRunner): Router {
  const router = Router();

  router.get("/health", async (_req, res) => {
    const body: HealthResponse = {
      ok: true,
      service: "zerocarbon-api",
      version: deps.version,
      aiMode: deps.aiMode,
      ...(deps.model ? { model: deps.model } : {}),
      submissionCount: (await deps.catalog.list()).length,
      time: nowIso(deps),
    };
    res.json(body);
  });

  router.get("/dashboard", async (_req, res) => {
    res.json(await buildDashboard(deps, runner));
  });

  router.get("/map", async (_req, res) => {
    res.json(await buildMap(deps, runner));
  });

  router.get("/reference", async (_req, res) => {
    res.json(await deps.catalog.getReference());
  });

  router.get("/regulations", (_req, res) => {
    res.json(deps.rules.list());
  });

  router.get("/regulations/:id", (req, res) => {
    const rule = deps.rules.get(req.params.id);
    if (!rule) throw new HttpError(404, `Regulation ${req.params.id} not found`);
    res.json(rule);
  });

  router.get("/audit", (req, res) => {
    res.json(deps.store.listAudit(parseInput(auditQuery, req.query)));
  });

  router.post("/demo/reset", async (req, res) => {
    const { keepUploads } = parseInput(resetRequest, req.body);
    const report = await deps.store.reset({ keepUploads });
    runner.reset();
    const { reviews, decisions, letters } = report.cleared;
    await recordAudit(deps, {
      type: "demo_reset",
      message: `Demo reset: cleared ${reviews} review(s), ${decisions} decision(s), ${letters} letter(s)`,
    });
    res.json({ ok: true, ...report });
  });

  return router;
}

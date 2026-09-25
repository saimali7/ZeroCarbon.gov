import { Router } from "express";
import type { AppDeps } from "../app.ts";
import { HttpError, parseInput } from "../lib/http.ts";
import { askQuestion } from "../services/documents.ts";
import { recordDecision } from "../services/letters.ts";
import type { ReviewRunner } from "../services/review-runner.ts";
import { requireRecord } from "../services/summaries.ts";
import { askRequest, decisionRequest, queryFlag } from "./schemas.ts";

export function reviewsRouter(deps: AppDeps, runner: ReviewRunner): Router {
  const router = Router();

  router.post("/submissions/:id/review", async (req, res) => {
    res.json(await runner.run(req.params.id));
  });

  router.get("/submissions/:id/review", async (req, res) => {
    await requireRecord(deps.catalog, req.params.id);
    const review = deps.store.getLatestReview(req.params.id);
    if (!review) throw new HttpError(404, "This submission has not been reviewed yet");
    res.json(review);
  });

  router.post(["/review-all", "/reviews/run-all"], async (req, res) => {
    res.json(await runner.runAll({ force: queryFlag(req.query.force) }));
  });

  for (const path of ["/submissions/:id/decisions", "/submissions/:id/decision"]) {
    router.post(path, async (req, res) => {
      res.status(201).json(await recordDecision(deps, String(req.params.id), parseInput(decisionRequest, req.body)));
    });
  }

  router.post("/submissions/:id/ask", async (req, res) => {
    const { question } = parseInput(askRequest, req.body);
    res.json(await askQuestion(deps, req.params.id, question));
  });

  return router;
}

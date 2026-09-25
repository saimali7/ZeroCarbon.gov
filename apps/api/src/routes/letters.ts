import { Router } from "express";
import type { AppDeps } from "../app.ts";
import { parseInput } from "../lib/http.ts";
import { draftLetter, getLetter, listLetters, updateLetter } from "../services/letters.ts";
import { letterDraftRequest, letterUpdateRequest } from "./schemas.ts";

export function lettersRouter(deps: AppDeps): Router {
  const router = Router();

  router.post("/submissions/:id/letters", async (req, res) => {
    res.status(201).json(await draftLetter(deps, req.params.id, parseInput(letterDraftRequest, req.body)));
  });

  router.get("/submissions/:id/letters", async (req, res) => {
    res.json(await listLetters(deps, req.params.id));
  });

  router.get("/letters/:letterId", (req, res) => {
    res.json(getLetter(deps, req.params.letterId));
  });

  router.patch("/letters/:letterId", async (req, res) => {
    res.json(await updateLetter(deps, req.params.letterId, parseInput(letterUpdateRequest, req.body)));
  });

  return router;
}

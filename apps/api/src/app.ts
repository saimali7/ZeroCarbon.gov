import express from "express";
import type { AiMode, AskResponse, RegulationRule } from "@zerocarbon/shared";
import { errorHandler, HttpError } from "./lib/http.ts";
import { lettersRouter } from "./routes/letters.ts";
import { reviewsRouter } from "./routes/reviews.ts";
import { submissionsRouter } from "./routes/submissions.ts";
import { systemRouter } from "./routes/system.ts";
import { createReviewRunner } from "./services/review-runner.ts";
import type { Store } from "./store/store.ts";
import type { AskInput, LetterInput, LetterOutput, ReviewPipeline, SubmissionCatalog } from "./types.ts";

export interface AppDeps {
  version: string;
  aiMode: AiMode;
  model?: string;
  maxUploadMb: number;
  catalog: SubmissionCatalog;
  pipeline: ReviewPipeline;
  store: Store;
  ai: {
    draftLetter(input: LetterInput): Promise<LetterOutput>;
    answerQuestion(input: AskInput): Promise<AskResponse>;
  };
  rules: { list(): RegulationRule[]; get(id: string): RegulationRule | undefined };
  now?: () => Date;
}

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  const runner = createReviewRunner(deps);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "2mb" }));
  app.use("/api", systemRouter(deps, runner), submissionsRouter(deps, runner), reviewsRouter(deps, runner), lettersRouter(deps));
  app.use("/api", (req) => {
    throw new HttpError(404, `No API route for ${req.method} ${req.originalUrl.split("?")[0]}`);
  });
  app.use(errorHandler);
  return app;
}

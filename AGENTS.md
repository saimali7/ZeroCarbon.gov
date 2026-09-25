# ZeroCarbon.gov: notes for contributors and agents

Hackathon project: an AI review copilot for UAE regulators checking facility emissions reports under Federal
Decree-Law No. 11 of 2024. **Hard requirement: a reviewer must be able to clone the repo and run `npm start` on any
machine (macOS, Windows, Linux) with no extra setup.** Breaking this can disqualify the project.

## Commands

- `npm start`: install if needed, build if needed, run web (3000) and API (4000), open the browser.
- `npm run dev`: same with hot reload.
- `npm run typecheck`: type-check all workspaces.
- `docker compose up --build`: container fallback.

## Layout

- `scripts/start.mjs`: the launcher. **Zero dependencies and conservative syntax**, because it runs before
  `npm install` and must print a helpful error on old Node versions. It spawns `node` directly (no shell) so it works
  on Windows.
- `apps/api`: Express 5 in TypeScript, run with `tsx` (no compile step). Imports use explicit `.ts` extensions.
- `apps/web`: Next.js 16 App Router, Tailwind v4. `app/api/[...path]/route.ts` proxies to the API using
  `BACKEND_URL`, read at request time. Don't use `NEXT_PUBLIC_*` variables for runtime config: they are baked in at
  build time. Read `apps/web/AGENTS.md` and `node_modules/next/dist/docs/` before changing Next.js code.
- `packages/shared`: TypeScript types shared by web and API (consumed as source via `transpilePackages`).
  **REST routes live in `packages/shared/src/routes.ts`** (`@zerocarbon/shared/routes`): the web client builds every
  URL from `apiRoutes` and the API must register the same paths and response types. Behaviour details the web app
  relies on (ids, status codes, stages) are listed in `apps/web/dev/README.md`.
- `apps/web/dev`: dev-only mock API with typed fixtures (`npm run mock-api -w @zerocarbon/web`, then `next dev` with
  `BACKEND_URL=http://127.0.0.1:4100`). Never used by `npm start`.
- Web UI: officer-side only. Design tokens in `apps/web/app/globals.css` (UAE government palette; the default
  Tailwind palette is removed), primitives in `apps/web/app/_components/ui`, fonts from `@fontsource-variable/*`.

## Rules that keep the one-command run working

- Every env var must have a safe default in code **and** be documented in `.env.example`. Never make the app depend
  on a value that only exists in someone's local `.env`.
- The app must work with no API keys. AI features need a demo path (cached outputs in `apps/api/data/ai-cache`, else
  templates) as well as the live OpenRouter path. `AI_MODE=auto` picks live only when `OPENROUTER_API_KEY` is set.
- Checks are deterministic and must reproduce `demo/ANSWER-KEY.md` (`apps/api/test/review-e2e.test.ts`). AI only
  extracts, explains and drafts; it never decides status or risk. Checks may only cite rule ids from
  `apps/api/data/regulations.json` (sourced; see each rule's `sourceUrl`).
- Tests: `npm test` (API: node:test via tsx). Parallel agents must not run git stash/checkout/clean or revert
  checkpoints: uncommitted work from other agents gets lost.
- Never commit secrets. `.env` is gitignored; only `.env.example` is committed.
- Commit `package-lock.json` after any dependency change, and pin exact versions. Prefer versions published at least
  7 days ago (use `npm install --before=<date>`).
- Avoid build-time network access (for example `next/font/google`). Fonts come from npm packages
  (`@fontsource-variable/roboto`, `@fontsource-variable/noto-kufi-arabic`, `geist`).
- `npm start` may only require Node.js. Data generators (for example the Python scripts in `demo/_generator`) are
  dev-only tools: commit their generated outputs, and never make startup depend on Python or another runtime.
- `allowScripts` in the root `package.json` approves `esbuild`'s install script (npm 12 blocks unapproved ones). If a
  dependency upgrade changes the esbuild version, update that entry (`npm approve-scripts esbuild`).
- Before pushing setup changes, simulate a fresh clone:
  `git ls-files --cached --others --exclude-standard -z | rsync -a --from0 --files-from=- ./ /tmp/zc-clone/`
  then run `npm start` in `/tmp/zc-clone`, and in Docker with `node:20.9.0-bookworm-slim --platform linux/amd64`.

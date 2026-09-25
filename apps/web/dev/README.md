# Dev mock API (temporary)

A zero-dependency Node HTTP server that implements every route in `packages/shared/src/routes.ts` with typed fixtures,
so the web app can be built before `apps/api` is ready. It is **dev-only**: `npm start` never runs it.

- `mock-api.ts`: the server (`node:http`, in-memory state, one log line per request).
- `lib.ts`: loaders for the real demo files (CSV parser, PDF text via `unpdf`, xlsx sheet names, reference data).
- `fixtures/`: typed fixtures checked by `tsc` against the shared contract: regulations corpus (every `RuleId`),
  parsed EAD workbooks for both demo facilities, precomputed reviews (findings, checks, metrics, facts),
  bilingual letter templates and canned answers for "Ask".

Documents are served from `demo/` (sizes and SHA-256 computed at startup). On startup the mock checks that every
fixture `EvidenceRef` points at a real document and that every quote is verbatim in it, and logs any problems.

## Run

```bash
npm run mock-api -w @zerocarbon/web                              # http://127.0.0.1:4100 (override with MOCK_API_PORT)
BACKEND_URL=http://127.0.0.1:4100 npm run dev -w @zerocarbon/web   # next dev, in a second terminal
```

The Next app proxies `/api/*` to `BACKEND_URL`, so no CORS is needed.

## Behaviour

- Submissions start as `not_reviewed`. `POST .../review` waits 0.9 to 1.8 s, then stores the fixture review.
- Decisions draft a letter by default (`draftLetter: false` to skip). Decisions and letters need a review first (409).
- Uploads are parsed in memory (nothing is written to disk) and matched to one of the two demo facilities by file name
  or workbook hash. Anything else returns 400.
- `POST /api/demo/reset` clears reviews, decisions, letters, uploads and the audit log.
- Regulator reference files are also addressable as documents of any submission: `ref-peer-benchmarks`,
  `ref-prior-year`, `ref-satellite` (fixture evidence for peers and satellite signals points at them).

## Contract details the real API should match

The web app relies on these behaviours (beyond the types):

- **Ids.** Demo submission ids are the folder names (`DEC_Southern-Dunes-CPF2_RY2025`). Document ids are the file
  name without the `CODE_` prefix and extension, lower-cased, other characters as hyphens
  (`DEC-SDF-CPF2_Monitoring-Plan_Rev3.0.pdf` → `monitoring-plan-rev3-0`), `-2` for duplicates.
- **`SubmissionDetail.evidence`** carries the parsed CSV evidence (flare log, fuel meter, diesel invoices, production
  balance). The flaring chart and the satellite cross-check read it.
- **Status codes.** Upload, decisions and letters return 201. Decisions and letters before any review return 409.
  Errors are `{ error }` JSON.
- **Stages.** `reviewing` while a review runs, `reviewed` after it, `decided` after a decision. Two concurrent review
  requests for one submission share a run.
- **Decisions** draft a letter by default, including `approve`.
- **Letters.** Approving sets `approvedBy` (from `officerName`) and `approvedAt`; returning to draft clears them.
  References look like `EAD/MRV/2026/AD-OG-0417/01`.
- **Peer statistics** in `ReviewMetrics` exclude the facility itself.
- **Impacts** that would double count carry `countsTowardTotal: false`, so the counted impacts sum to
  `estimatedUnderReportingTco2e`.
- **Audit** is newest first; `demo_reset` re-seeds `submission_received` events.

## Keep in sync or delete

This mock must match `packages/shared/src/routes.ts` and `packages/shared/src/index.ts`. Delete this folder (and the
`mock-api` script in `apps/web/package.json`) once `apps/api` implements the routes, or keep it in sync with every
contract change.

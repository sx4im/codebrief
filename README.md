# Codebrief

Codebrief ingests a GitHub repository and produces an AI technical brief for codebase handoff, audit, and due diligence. The brief has four core sections: system narrative, decision archaeology, landmine map, and rewrite assessment.

## Workspace

- `apps/web` - Next.js App Router web app with Clerk auth, dashboard, analysis trigger APIs, brief viewer, exports, billing routes, and public demo briefs.
- `packages/pipeline` - BullMQ worker, GitHub ingestion, tree-sitter AST extraction, analysis stages, NVIDIA NIM agents, source validation, artifact storage, and Socket.io progress emitters.
- `shared/types` - Shared Zod schemas and TypeScript types for briefs, pipeline events, GitHub records, and billing plans.
- `src/m0` - M0 spike and local tests for source validation, AST parsing, risk scoring, and architecture-agent retry behavior.

## Setup

```bash
npm install
cp .env.example .env
```

Fill `.env` with Clerk, GitHub, Postgres, Redis, NVIDIA NIM, R2, Lemon Squeezy, and optional Puppeteer Chrome values. Secrets are not hardcoded.

Apply the database schema after `DATABASE_URL` is set:

```bash
npm run db:migrate
```

## Development

Run the web app, worker, and Socket.io progress server in separate shells:

```bash
npm run dev:web
npm run dev:worker
npm run dev:ws
```

Start a live analysis from `/projects/new`. The start route creates durable project, analysis, and stage records before enqueueing the BullMQ job. Without credentials, the app shows explicit configuration or queue failures instead of fake live output.

Check deployment readiness without exposing secrets:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/health?deep=1
```

Failed stages expose retry controls in the progress UI. Retrying creates a new analysis with the original config plus retry metadata so the sequential pipeline is replayed with clean inputs.

## Corpus Gates

Prepare the five-repo corpus manifest without credentials:

```bash
npm run pipeline:corpus -- --mode=dry-run --scope=quick
```

Run the corpus directly through the pipeline after credentials are set:

```bash
npm run pipeline:corpus -- --mode=direct --scope=full
```

Enqueue the corpus through BullMQ instead:

```bash
npm run pipeline:corpus -- --mode=queue --scope=full
```

Verify generated brief artifacts:

```bash
npm run pipeline:verify-briefs -- artifacts/corpus/<run-id>/pipeline
```

The default corpus covers one repo per language family required by the M1 gate: `shadcn-ui/ui` (TypeScript), `django/django` (Python), `go-gorm/gorm` (Go), `rails/rails` (Ruby), and `supabase/supabase` (mixed).

## Verification

```bash
npm run typecheck
npm test
npm run build -w apps/web
npm audit
```

The M0 runner still requires real credentials:

```bash
npm run m0
```

M0 passes only when `supabase/supabase` is ingested through the authenticated GitHub API, tree-sitter parses TS/TSX files, risk scores are computed, the Architecture Agent identifies Supabase as a Firebase alternative built on Postgres, at least three claims have specific file or PR sources, and source validation passes.

## Production Notes

- NVIDIA NIM calls use the OpenAI SDK with `baseURL=https://integrate.api.nvidia.com/v1`.
- Agent calls are serialized and retry 429s with exponential backoff.
- Agent outputs are validated after every call. Invalid citations trigger one correction retry; still-invalid claim-like output is downgraded to `confidence: 0` with inferred validation-failure sources where the schema can represent that repair. Invalid unrecoverable output fails the analysis rather than entering a brief.
- Large raw pipeline artifacts are written through the artifact store and indexed in Postgres.
- Sentry is initialized for browser, server, and edge runtimes when `SENTRY_DSN` or `NEXT_PUBLIC_SENTRY_DSN` is configured. Source-map upload is enabled only when `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are set.
- Public demo briefs live at `/demo` and `/demo/[slug]`. They are static demos, not substitutes for credentialed M0-M5 gate evidence.

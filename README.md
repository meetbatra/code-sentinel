<div align="center">
  <img src="public/logo.svg" alt="Code Sentinel logo" width="92" />
  <h1>Code Sentinel</h1>
  <p><strong>Autonomous bug validation for Node.js apps with backend + full-stack browser testing.</strong></p>

  <p>
    <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-111111?logo=nextdotjs" />
    <img alt="React" src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white" />
    <img alt="Inngest" src="https://img.shields.io/badge/Inngest-Orchestration-7A3EFF" />
    <img alt="E2B" src="https://img.shields.io/badge/E2B-Sandboxed%20Execution-FF6B35" />
    <img alt="Prisma" src="https://img.shields.io/badge/Prisma-PostgreSQL-2D3748?logo=prisma" />
    <img alt="Auth" src="https://img.shields.io/badge/Auth-Clerk%20%2B%20GitHub-6C47FF" />
  </p>

  <p>
    <a href="#why-code-sentinel">Why</a> •
    <a href="#what-happens-during-a-run">How It Works</a> •
    <a href="#product-surfaces">Product Surfaces</a> •
    <a href="#quick-start">Quick Start</a> •
    <a href="#environment-variables">Environment</a>
  </p>
</div>

![Code Sentinel hero](docs/images/code-sentinel-hero.svg)

## Why Code Sentinel
Teams lose time manually reproducing bug reports before they can fix anything. Code Sentinel converts a bug description into an executed validation pipeline with inspectable artifacts:

- generated backend API test files
- browser-driven edge-case checks (full-stack mode)
- pass/fail outcomes + assertions
- screenshots and bug write-ups
- suggested fix directions

## What Happens During a Run
When you click **Run**, Code Sentinel:

1. analyzes the target repository
2. prepares an isolated sandbox
3. generates and executes backend test files
4. runs browser scenarios when full-stack scope is enabled
5. persists results (tests, bugs, screenshots, summary)

![Testing pipeline](docs/images/testing-pipeline.svg)

## Product Surfaces
### 1) Home (`/`)
- choose repository (from connected GitHub account)
- describe bug in plain English
- choose mode: `fast` or `deep`
- choose scope: `auto`, `backend-only`, `full-stack`
- start run

### 2) Results (`/test/[jobId]`)
The page is intentionally ordered to move from summary to deep evidence:

1. Header: repo, status, bug prompt
2. Test Results Overview: totals, bug summary, analysis summary, technical details
3. Detailed Bug Reports: confidence, root cause, affected layer, suggested fixes
4. Tests: browser edge cases first, API test files second

![Results layout](docs/images/results-layout.svg)

In the **Tests** area:
- browser rows include steps, UI/network assertions, and screenshots
- backend cards include console output + full generated test code
- generated backend test files can be downloaded directly from the UI

### 3) Dashboard (`/dashboard`)
- all runs in one place
- tabs for `All`, `Running`, `Completed`, `Cancelled`
- quick actions: cancel active runs, rerun completed runs
- quick navigation back to detailed run evidence

## Core Capabilities
- Backend-first validation with generated test artifacts
- Full-stack browser automation for real user-flow verification
- Fast mode for quick signal and Deep mode for broader edge-case coverage
- Structured bug records with confidence, source mapping, and fix suggestions
- Persistent run history + metrics via Prisma

## Stack
- **Frontend:** Next.js 16, React 19, Tailwind, shadcn/ui
- **API Layer:** tRPC + React Query
- **Orchestration:** Inngest + Agent Kit
- **Execution:** E2B sandbox
- **Data:** Prisma + PostgreSQL
- **Auth + Repo Access:** Clerk + GitHub OAuth (Octokit)

## Quick Start
### Prerequisites
- Node.js 20+
- PostgreSQL
- Clerk app configured with GitHub OAuth
- E2B API key
- Inngest keys
- Optional: Cloudinary credentials for screenshot hosting

### Install and run
```bash
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```

In another terminal (recommended for local orchestration):
```bash
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

Open `http://localhost:3000`.

## Environment Variables
Create `.env.local`:

```env
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/code_sentinel

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...

# Inngest
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...

# E2B
E2B_API_KEY=e2b_...

# Mongo template URI for temporary DB provisioning
# Must include {db_name}
MONGO_URI=mongodb+srv://<user>:<pass>@cluster.mongodb.net/{db_name}

# Optional Cloudinary for screenshot URLs
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_UPLOAD_PRESET=...
# or
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
CLOUDINARY_FOLDER=code-sentinel/screenshots
```

## Runtime Note
The model client in `src/inngest/functions.ts` is configured to use an OpenAI-compatible endpoint at `http://localhost:4141/v1` in the current setup. Update that configuration for your production provider/endpoint.

## Architecture Map
| Layer | Key Files |
|---|---|
| Home and run creation | `src/app/(home)/page.tsx` |
| Results UI | `src/app/test/[jobId]/page.tsx` |
| Dashboard UI | `src/app/dashboard/page.tsx` |
| Run mutation + app router | `src/trpc/routers/_app.ts` |
| Jobs APIs (list/get/cancel/rerun) | `src/trpc/routers/jobs.ts` |
| GitHub repo fetch | `src/trpc/routers/github.ts` |
| Agent orchestration | `src/inngest/functions.ts` |
| Agent tools | `src/inngest/tools/*` |
| Data model | `prisma/schema.prisma` |

## Repository Structure
```text
src/
  app/
    (home)/page.tsx
    test/[jobId]/page.tsx
    dashboard/page.tsx
    api/inngest/route.ts
    api/trpc/[trpc]/route.ts
  inngest/
    functions.ts
    tools/
  trpc/
    routers/
prisma/
  schema.prisma
  migrations/
public/
docs/images/
```

## Contributing
PRs are welcome. If you are adding major behavior changes, please also update the README sections for run flow and results layout.

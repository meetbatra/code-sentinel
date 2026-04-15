<div align="center">
  <img src="public/logo.svg" alt="Code Sentinel logo" width="92" />
  <h1>Code Sentinel</h1>
  <p><strong>HUNT BUGS BEFORE THEY HUNT YOU.</strong></p>
  <p>Arcade-style mission control for autonomous backend + full-stack bug validation.</p>

  <p>
    <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-111111?logo=nextdotjs" />
    <img alt="React" src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white" />
    <img alt="tRPC" src="https://img.shields.io/badge/tRPC-API%20Layer-398CCB" />
    <img alt="Inngest" src="https://img.shields.io/badge/Inngest-Orchestration-7A3EFF" />
    <img alt="E2B" src="https://img.shields.io/badge/E2B-Sandboxed%20Execution-FF6B35" />
    <img alt="Prisma" src="https://img.shields.io/badge/Prisma-PostgreSQL-2D3748?logo=prisma" />
    <img alt="Auth" src="https://img.shields.io/badge/Auth-Clerk%20%2B%20GitHub-6C47FF" />
  </p>

  <p>
    <a href="#quick-start">Quick Start</a> •
    <a href="#mission-features">Mission Features</a> •
    <a href="#configuration">Configuration</a> •
    <a href="#architecture--api-surfaces">Architecture</a> •
    <a href="#contributing">Contributing</a>
  </p>
</div>

![Code Sentinel hero](docs/images/code-sentinel-hero.svg)

## Quick Start

### Prerequisites
- Node.js 20+
- PostgreSQL
- Clerk app configured with GitHub OAuth
- E2B API key
- Inngest keys
- Optional: Cloudinary credentials for screenshot hosting

### Install + launch
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

Open `http://localhost:3000` and launch your first mission.

## Mission Features

- **Mission setup from plain English:** pick a repo, describe a bug, and run.
- **Fast vs Deep modes:** quick confirmation or broader edge-case sweep.
- **Backend + full-stack coverage:** generated API tests plus browser-driven flows.
- **Bug evidence pack:** assertions, outputs, screenshots, and root-cause hints.
- **Mission Control dashboard:** rerun/cancel jobs and track status in real time.
- **Persistent telemetry:** test and bug history stored via Prisma/Postgres.

## How a Mission Runs

1. **ANALYZING TARGET**: repository structure is inspected.
2. **SETTING UP FOR BATTLE**: sandbox + environment are prepared.
3. **ENGAGED IN TESTING**: generated backend tests and optional browser checks execute.
4. **RESULTS LOCKED**: tests, bugs, screenshots, and summary are persisted.

![Testing pipeline](docs/images/testing-pipeline.svg)

## Product Surfaces

### Home (`/`)
- Select repository (from connected GitHub account)
- Enter bug description
- Choose mode: `fast` or `deep`
- Choose scope: `auto`, `backend-only`, `full-stack`
- Start mission

### Results (`/test/[jobId]`)
- Mission status + summary
- Bug reports (`BUGS_DETECTED`)
- Test evidence (`TESTS RUN`) with file output and screenshots
- Download generated backend test files

![Results layout](docs/images/results-layout.svg)

### Dashboard (`/dashboard`)
- Tabs: `All`, `Running`, `Completed`, `Cancelled`
- Cancel active missions
- Queue reruns from completed missions
- Jump back to full mission evidence

### Integrations (`/dashboard/integrations`)
- Add and rotate API keys in the vault
- Soft-delete vault keys
- View key metadata (service + last-used timestamp)

## Configuration

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

# API Vault encryption key (required for integrations)
# 32-byte hex key (64 chars)
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

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

### Runtime note
`src/inngest/functions.ts` currently targets an OpenAI-compatible endpoint at `http://localhost:4141/v1`. Update this for your production provider.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start Next.js app locally |
| `npm run build` | Build for production |
| `npm run start` | Run production build |
| `npm run lint` | Run ESLint |
| `npm run e2b:build:dev` | Build E2B template (dev) |
| `npm run e2b:build:prod` | Build E2B template (prod) |

## Architecture & API Surfaces

| Layer | Key files |
|---|---|
| Home and mission creation | `src/app/(home)/page.tsx` |
| Results UI | `src/app/test/[jobId]/page.tsx` |
| Dashboard UI | `src/app/dashboard/page.tsx` |
| Integrations vault UI | `src/app/dashboard/integrations/page.tsx` |
| Run mutation + router root | `src/trpc/routers/_app.ts` |
| Jobs APIs (list/get/cancel/rerun) | `src/trpc/routers/jobs.ts` |
| GitHub repository fetch | `src/trpc/routers/github.ts` |
| Agent orchestration | `src/inngest/functions.ts` |
| Agent toolchain | `src/inngest/tools/*` |
| Data model | `prisma/schema.prisma` |

## Repository Structure

```text
src/
  app/
    (home)/page.tsx
    test/[jobId]/page.tsx
    dashboard/page.tsx
    dashboard/integrations/page.tsx
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

PRs are welcome. If you change mission flow, job statuses, results layout, or environment requirements, update this README in the same PR.

## License

No project license file is currently defined in the repository.

# 🛡️ Code Sentinel

**Autonomous bug validation agent that analyzes, reproduces, and confirms bugs in Node.js backend applications.**

Stop manually reproducing bugs. Point Code Sentinel at your GitHub repo, and it automatically validates reported issues by analyzing your codebase, setting up environments, writing tests, and reporting results.

---

## 🚀 What It Does

Code Sentinel is an AI-powered testing agent that:

1. **📖 Analyzes Your Codebase** - Discovers endpoints, dependencies, and architecture
2. **🔧 Sets Up Environments** - Installs deps, provisions databases, configures env vars
3. **✍️ Writes Test Files** - One test per bug, using real HTTP requests
4. **🧪 Runs Tests in Sandboxes** - Isolated execution via E2B
5. **📊 Reports Results** - Confirms bugs and identifies root causes

**Perfect for:** Development teams overwhelmed with bug reports that need validation before investigation.

---

## 🎯 Key Features

- **Autonomous bug validation** - No manual reproduction needed
- **GitHub integration** - Pull issues directly from your repos
- **E2B sandboxes** - Safe, isolated code execution
- **Smart environment setup** - Auto-detects and provisions MongoDB, env vars
- **One bug = One test** - Clean, organized test suite
- **Root cause analysis** - Identifies exact files and functions causing bugs
- **Type-safe API** - Built with tRPC for end-to-end type safety

---

## 🛠️ Tech Stack

- **[Next.js 16](https://nextjs.org/)** - App Router with React Server Components
- **[tRPC](https://trpc.io/)** - End-to-end type-safe API
- **[E2B Code Interpreter](https://e2b.dev/)** - Sandboxed code execution
- **[Inngest Agent Kit](https://www.inngest.com/)** - AI agent orchestration
- **[Clerk](https://clerk.com/)** - Authentication
- **[Prisma](https://www.prisma.io/)** + **PostgreSQL** - Database & ORM
- **[Octokit](https://github.com/octokit/octokit.js)** - GitHub API integration
- **[Tailwind CSS](https://tailwindcss.com/)** + **[shadcn/ui](https://ui.shadcn.com/)** - Styling & components

---

## 📦 Installation

### Prerequisites

- Node.js 20+
- PostgreSQL database
- E2B API key ([get one here](https://e2b.dev))
- Clerk account ([sign up](https://clerk.com))
- GitHub OAuth app (for repo access)

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/meetbatra/code-sentinel.git
   cd code-sentinel
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env.local` file:
   ```env
   # Database
   DATABASE_URL="postgresql://user:password@localhost:5432/code_sentinel"
   
   # Clerk Auth
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   
   # E2B Sandbox
   E2B_API_KEY=e2b_...
   
   # GitHub
   GITHUB_TOKEN=ghp_...
   
   # Inngest
   INNGEST_EVENT_KEY=...
   INNGEST_SIGNING_KEY=...
   ```

4. **Set up the database**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

5. **Run the development server**
   ```bash
   npm run dev
   ```

6. **Open [http://localhost:3000](http://localhost:3000)**

---

## 🎮 Usage

### Basic Workflow

1. **Connect GitHub** - Authenticate and grant repo access
2. **Select Repository** - Choose the repo you want to test
3. **Create a Job** - Paste bug report or GitHub issue URL
4. **Watch the Magic** - Code Sentinel analyzes, tests, and reports
5. **Review Results** - See which bugs are confirmed with root cause analysis

### Example Bug Report

```
Bug: Password validation allows weak passwords

Steps to reproduce:
1. POST /api/v1/user/signup
2. Use password: "123"
3. User is created without validation

Expected: Should reject passwords < 8 characters
Actual: Accepts any password
```

Code Sentinel will:
- ✅ Discover the `/api/v1/user/signup` endpoint
- ✅ Set up the environment
- ✅ Write a test that attempts weak password signup
- ✅ Confirm the bug exists
- ✅ Identify the validation function missing checks

---

## 🏗️ Project Structure

```
code-sentinel/
├── src/
│   ├── app/              # Next.js App Router pages
│   ├── components/       # React components (shadcn/ui)
│   ├── trpc/            # tRPC router & procedures
│   ├── prompt.ts        # Agent system prompt
│   └── proxy.ts         # E2B sandbox proxy
├── prisma/              # Database schema
├── sandbox-templates/   # E2B sandbox configs
└── public/             # Static assets
```

---

## 🤖 How It Works

### The Agent Workflow

```
┌─────────────┐
│ Bug Report  │
└──────┬──────┘
       │
       v
┌──────────────────┐
│ Analyze Codebase │  (Read package.json, routes, endpoints)
└──────┬───────────┘
       │
       v
┌──────────────────┐
│ Setup Environment│  (Install deps, provision DB, create .env)
└──────┬───────────┘
       │
       v
┌──────────────────┐
│ Write Tests      │  (One test file per bug)
└──────┬───────────┘
       │
       v
┌──────────────────┐
│ Execute Tests    │  (Run in E2B sandbox)
└──────┬───────────┘
       │
       v
┌──────────────────┐
│ Report Results   │  (Confirm bugs + root cause)
└──────────────────┘
```

### Key Components

- **`prompt.ts`** - Defines the autonomous agent's behavior
- **E2B Sandboxes** - Isolated environments for running tests
- **tRPC Routers** - Type-safe API endpoints (`github.ts`, `jobs.ts`)
- **Inngest** - Orchestrates long-running agent workflows
- **Prisma** - Stores jobs, test results, and bug reports

---

## 🔒 Security

- **Sandboxed execution** - All code runs in isolated E2B containers
- **No code access to host** - Complete isolation from your infrastructure
- **GitHub OAuth** - Secure token-based authentication
- **Environment isolation** - Each test gets fresh environment

---

## 🚧 Roadmap

- [ ] Support for additional frameworks (Fastify, Koa, NestJS)
- [ ] Frontend bug validation (React, Vue, Svelte)
- [ ] Integration with CI/CD pipelines
- [ ] Slack/Discord notifications
- [ ] Multi-language support (Python, Go, Ruby)
- [ ] Performance regression testing
- [ ] Security vulnerability scanning

---

## 🤝 Contributing

Contributions are welcome! Please open an issue or submit a pull request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

This project is private. All rights reserved.

---

## 🙏 Acknowledgments

Built with:
- [Next.js](https://nextjs.org/) - React framework
- [E2B](https://e2b.dev/) - Code execution sandboxes
- [Inngest](https://www.inngest.com/) - Agent orchestration
- [tRPC](https://trpc.io/) - Type-safe APIs
- [Clerk](https://clerk.com/) - Authentication
- [Vercel](https://vercel.com/) - Deployment platform

---

## 📧 Contact

**Meet Batra** - [@meetbatra](https://github.com/meetbatra)

Project Link: [https://github.com/meetbatra/code-sentinel](https://github.com/meetbatra/code-sentinel)

---

<div align="center">
  <strong>Built with ⚡ by developers, for developers.</strong>
  <br />
  <sub>Stop manually reproducing bugs. Let Code Sentinel do it for you.</sub>
</div>

# Code-Sentinel: Frontend E2E Testing Integration Research

## Current Architecture Summary

**What code-sentinel does today:**
- Next.js 16 app with Clerk auth, tRPC, Prisma/Postgres, Inngest for async workflows
- User submits a GitHub repo URL + bug description
- An Inngest agent spins up an **E2B sandbox** (Node.js 21-slim Docker image)
- Agent clones the repo, discovers codebase, sets up env, starts server, writes test files, runs them via `node-fetch` HTTP calls
- Records test results and detected bugs in Postgres

**Current sandbox:** `node:21-slim` with git, curl, bash — **no browser, no Playwright, no Chromium**

**Current testing:** Backend-only via HTTP fetch calls (API endpoint testing)

---

## The Goal: Add Frontend E2E Testing

Enable the agent to:
1. Open pages in a headless browser
2. Fill and submit forms
3. Click buttons, navigate between pages
4. Monitor network requests/responses (like Chrome DevTools Network tab)
5. Capture console logs and errors
6. Assert on visible text, DOM state, screenshots
7. Test full user flows end-to-end (signup → dashboard → create item → verify)

---

## How To Do It: Integration Plan

### Layer 1: Sandbox Template (Install Playwright + Chromium)

The E2B sandbox needs Chromium + Playwright pre-installed. Two approaches:

#### Option A: Extend the Dockerfile (Recommended)

```dockerfile
FROM node:21-slim

RUN apt-get update && apt-get install -y \
    git curl bash \
    # Playwright/Chromium dependencies
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 \
    libpango-1.0-0 libcairo2 libasound2 libatspi2.0-0 \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Pre-install Playwright globally with Chromium only
RUN npm install -g playwright@latest
RUN npx playwright install chromium --with-deps

COPY run.sh /run.sh
RUN chmod +x /run.sh

WORKDIR /home/user
CMD ["bash"]
```

**Why Chromium only:** Firefox and WebKit add ~400MB each. Chromium alone covers 95% of testing needs and keeps the sandbox image smaller.

#### Option B: Use Microsoft's Official Playwright Docker Image as Base

```dockerfile
FROM mcr.microsoft.com/playwright:v1.50.0-noble

RUN apt-get update && apt-get install -y git curl && apt-get clean
RUN npm install -g node-fetch

COPY run.sh /run.sh
RUN chmod +x /run.sh

WORKDIR /home/user
CMD ["bash"]
```

**Tradeoff:** Larger image (~2GB) but guaranteed all browser deps are met.

#### Recommendation: Option A
- Smaller image, only Chromium
- More control over what's installed
- E2B charges per sandbox compute time, so smaller = faster boot

---

### Layer 2: New Agent Tool — `browserAction`

Create a new Inngest agent tool that the agent can call for browser operations.

**File: `src/inngest/tools/browser-action.ts`**

```typescript
import { z } from "zod";
import { createTool } from "@inngest/agent-kit";
import { getSandbox } from "@/inngest/utils";

interface BrowserActionToolOptions {
    sandboxId: string;
}

export const createBrowserActionTool = ({ sandboxId }: BrowserActionToolOptions) => {
    return createTool({
        name: "browserAction",
        description: `Execute Playwright browser actions inside the sandbox. 
        Actions: navigate, click, fill, submit, screenshot, getContent, 
        interceptNetwork, getConsoleLogs, evaluate, waitForSelector.
        The tool runs a Playwright script in the sandbox and returns results.`,
        parameters: z.object({
            script: z.string().describe(
                "A complete Node.js script using Playwright. Must be self-contained. " +
                "Import from 'playwright'. Use chromium.launch({headless: true}). " +
                "Print results to stdout as JSON."
            ),
            timeout: z.number().optional().describe("Timeout in seconds (default 30)")
        }),
        handler: async (params, { step: toolStep }) => {
            const { script, timeout = 30 } = params;
            
            try {
                return await toolStep?.run("browser-action", async () => {
                    const sandbox = await getSandbox(sandboxId);
                    
                    // Write script to temp file
                    await sandbox.files.write("/tmp/browser-script.mjs", script);
                    
                    // Execute with Playwright
                    const result = await sandbox.commands.run(
                        `cd repo && node /tmp/browser-script.mjs`,
                        { timeoutMs: timeout * 1000 }
                    );
                    
                    if (result.error) {
                        return `Browser action failed:\nstdout: ${result.stdout}\nstderr: ${result.stderr}`;
                    }
                    
                    return result.stdout;
                });
            } catch (error) {
                return `Browser action error: ${error instanceof Error ? error.message : "Unknown"}`;
            }
        },
    });
};
```

**Alternative approach — structured actions instead of raw scripts:**

Instead of giving the agent a raw script parameter, you could define structured actions:

```typescript
parameters: z.object({
    action: z.enum(["navigate", "click", "fill", "screenshot", "getText", "getNetwork", "evaluate"]),
    url: z.string().optional(),
    selector: z.string().optional(),
    value: z.string().optional(),
    javascript: z.string().optional(),
})
```

**Recommendation:** Use the raw script approach. The agent is already writing full test files; giving it full Playwright script control is more flexible and powerful. The structured approach limits what the agent can do.

---

### Layer 3: Persistent Browser Session Tool

For multi-step interactions (navigate → fill form → submit → check result), a persistent browser session is better than launching/closing for each action.

**File: `src/inngest/tools/browser-session.ts`**

```typescript
// Tool: startBrowser — launches Chromium, returns session ID
// Tool: browserStep — runs a step against the active session
// Tool: closeBrowser — cleanup

// Implementation: The sandbox maintains a WebSocket server 
// that keeps the browser alive between tool calls.
```

**How it works:**
1. Agent calls `startBrowser` → launches Chromium in sandbox, starts a tiny WS relay server on a port
2. Agent calls `browserStep` with Playwright commands → connects to running browser via CDP, executes, returns results
3. Agent calls `closeBrowser` → cleanup

**This is how OpenClaw does it** — it runs a Playwright browser server (`chromium.launchServer()`) and connects to it via WebSocket for each action.

---

### Layer 4: Update the Agent Prompt

Add frontend testing instructions to `src/prompt.ts`:

```
====================
FRONTEND TESTING (E2E)
====================

When the target app has a frontend (React, Next.js, Vue, Angular, HTML):

1. DETECT FRONTEND
   - Look for: pages/, components/, public/index.html, src/App.jsx
   - Check package.json for: react, next, vue, angular, svelte
   - Identify if it's SSR (Next.js) or SPA

2. START THE APP
   - For Next.js: npm run dev (or npm run build && npm start)
   - For React SPA: npm start
   - Wait for the dev server to be ready
   - Get sandbox URL via getServerUrl

3. WRITE BROWSER TESTS
   Use Playwright for all frontend tests:
   
   ```javascript
   import { chromium } from 'playwright';
   
   const BASE_URL = process.env.BASE_URL || 'https://3000-xxxxx.e2b.app';
   
   async function testFormSubmission() {
     const browser = await chromium.launch({ headless: true });
     const context = await browser.newContext();
     const page = await context.newPage();
     
     // Navigate
     await page.goto(`${BASE_URL}/signup`);
     
     // Fill form
     await page.fill('input[name="email"]', 'test@example.com');
     await page.fill('input[name="password"]', 'weakpass');
     await page.click('button[type="submit"]');
     
     // Assert
     const errorMsg = await page.textContent('.error-message');
     console.log(JSON.stringify({ 
       pass: errorMsg?.includes('Password too weak'),
       error: errorMsg 
     }));
     
     await browser.close();
   }
   
   testFormSubmission();
   ```

4. NETWORK MONITORING
   Capture and assert on API calls made by the frontend:
   
   ```javascript
   const requests = [];
   page.on('request', req => {
     if (req.url().includes('/api/')) {
       requests.push({ method: req.method(), url: req.url() });
     }
   });
   
   page.on('response', res => {
     if (res.url().includes('/api/')) {
       requests.push({ 
         url: res.url(), 
         status: res.status(),
         body: await res.text()
       });
     }
   });
   ```

5. CONSOLE LOG MONITORING
   Capture browser console errors:
   
   ```javascript
   const consoleLogs = [];
   page.on('console', msg => {
     consoleLogs.push({ type: msg.type(), text: msg.text() });
   });
   
   page.on('pageerror', err => {
     consoleLogs.push({ type: 'error', text: err.message });
   });
   ```

6. SCREENSHOTS
   Take screenshots on failure for debugging:
   
   ```javascript
   await page.screenshot({ path: 'failure.png', fullPage: true });
   ```

TOOLS (additional):
- browserAction — Run a complete Playwright script in the sandbox
- All existing tools still work for backend testing
```

---

### Layer 5: Schema Updates

Add frontend testing fields to the Prisma schema:

```prisma
model Test {
  // ... existing fields ...
  
  testType    String    @default("api")  // "api" | "e2e" | "visual"
  screenshot  String?   // path to screenshot if taken
  networkLogs Json?     // captured network requests/responses
  consoleLogs Json?     // captured browser console output
}

model Job {
  // ... existing fields ...
  
  appType     String?   // "backend" | "frontend" | "fullstack"
  frontendFramework String?  // "react" | "next" | "vue" | "angular" | null
}
```

---

## Features This Enables

### 1. Form Testing
- Navigate to forms, fill inputs, submit
- Assert validation messages appear
- Test all input types (text, select, checkbox, file upload)
- Test form error states

### 2. Navigation & Routing Testing
- Click links, verify correct page loads
- Test protected routes (redirect to login)
- Test 404 pages
- Test back/forward navigation

### 3. Network Monitoring (DevTools Network Tab equivalent)
- Intercept all XHR/fetch requests
- Assert correct API calls are made
- Check request payloads and headers
- Mock API responses for isolated testing
- Test loading states and error states

### 4. Console Monitoring
- Capture all console.log, console.error, console.warn
- Detect uncaught exceptions
- Find React/Vue hydration errors
- Spot deprecated API warnings

### 5. Visual Regression
- Take screenshots at key points
- Compare screenshots across runs (optional)
- Full-page and element-level screenshots

### 6. Authentication Flow Testing
- Test signup → email verify → login → dashboard
- Test OAuth flows (mock with route interception)
- Test session persistence and logout

### 7. Accessibility Testing
- Use Playwright's built-in accessibility tree
- Check ARIA labels, roles, tab order
- Test keyboard navigation

### 8. Performance Monitoring
- Measure page load times
- Track largest contentful paint (LCP)
- Monitor memory usage
- Check bundle sizes via network

### 9. Responsive Testing
- Test at different viewport sizes
- Verify mobile menu behavior
- Check touch events

### 10. Complete User Flow E2E
- Signup → Create Item → Edit → Delete → Verify deletion
- Multi-page workflows
- Shopping cart → Checkout → Payment

---

## Implementation Roadmap

### Phase 1: Infrastructure (1-2 days)
- [ ] Update `e2b.Dockerfile` to install Chromium + Playwright deps
- [ ] Rebuild and test the E2B sandbox template
- [ ] Verify Playwright launches successfully inside sandbox

### Phase 2: Agent Tools (1-2 days)
- [ ] Create `browserAction` tool (raw Playwright script execution)
- [ ] Register tool in `functions.ts`
- [ ] Test basic browser operations (navigate, click, screenshot)

### Phase 3: Prompt Engineering (1 day)
- [ ] Update `TEST_AGENT_PROMPT` with frontend testing section
- [ ] Add frontend detection logic
- [ ] Add Playwright test templates for common patterns

### Phase 4: Schema & UI (1-2 days)
- [ ] Update Prisma schema with testType, screenshot, networkLogs, consoleLogs
- [ ] Update frontend UI to show E2E test results
- [ ] Display screenshots and network logs in the job detail view

### Phase 5: Advanced Features (2-3 days)
- [ ] Persistent browser session (multi-step interactions)
- [ ] Network interception and mocking
- [ ] Console log capture and assertion
- [ ] Visual regression comparison

### Total Estimate: ~7-10 days for full integration

---

## Key Technical Decisions

| Decision | Recommendation | Why |
|----------|---------------|-----|
| Browser | Chromium only | Smallest image, covers 95% of cases |
| Tool style | Raw Playwright scripts | Most flexible, agent already writes code |
| Browser lifecycle | Launch per test file (Phase 1), persistent session (Phase 5) | Simpler first, optimize later |
| Dockerfile approach | Extend existing node:21-slim | Smaller, more control |
| Frontend detection | Agent reads package.json + file structure | Same as current backend detection |
| Screenshot storage | Save to sandbox filesystem, read back as base64 | E2B supports file read |

---

## Risk Mitigation

1. **E2B Sandbox size limit**: Chromium adds ~300MB. E2B templates support this but build time increases. Pre-build and cache the template.

2. **Timeout**: Browser tests take longer than HTTP fetch tests. Increase sandbox timeout from current value. Recommend 5 min per test file for E2E.

3. **Flaky tests**: Browser tests can be flaky. Add retry logic and `waitForSelector` instead of arbitrary delays. The prompt should instruct the agent to use Playwright's auto-waiting.

4. **Memory**: Chromium uses ~200-500MB RAM. E2B sandboxes have sufficient memory, but avoid opening many tabs simultaneously.

5. **CSP / CORS in sandbox**: Some apps may block connections. The sandbox URL is the same origin, so this shouldn't be an issue for most apps.

---

## References

- [Playwright Docker docs](https://playwright.dev/docs/docker)
- [E2B Custom Templates](https://e2b.dev/docs/mcp/custom-templates)
- [Playwright Network Interception](https://playwright.dev/docs/network)
- [Playwright MCP + Test Agents](https://medium.com/@dneprokos/how-playwright-test-agents-are-changing-the-game-in-e2e-automation-5827e19574ae)
- [browserless/chrome Docker](https://hub.docker.com/r/browserless/chrome)

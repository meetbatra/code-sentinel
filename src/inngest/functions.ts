import { inngest } from "./client";
import {
    createAgent,
    createState,
    createNetwork,
    openai,
    anthropic,
} from "@inngest/agent-kit";
import { Sandbox } from "@e2b/code-interpreter";
import { SANDBOX_TIMEOUT, TestingMode, TestingScope } from "@/inngest/types";
import { getSandbox } from "@/inngest/utils";
import { lastAssistantTextMessageContent } from "@/lib/utils";
import { TEST_AGENT_PROMPT } from "@/prompt";
import { createTerminalTool } from "@/inngest/tools/terminal";
import { createOrUpdateFilesTool } from "@/inngest/tools/create-or-update-files";
import { createReadFilesTool } from "@/inngest/tools/read-files";
import { createEnvTool } from "@/inngest/tools/create-env";
import { createMongoDbTool } from "@/inngest/tools/create-mongodb";
import { createGetServerUrlTool } from "@/inngest/tools/get-server-url";
import { createUpdateDiscoveryTool } from "@/inngest/tools/update-discovery";
import { createUpdateServerInfoTool } from "@/inngest/tools/update-server-info";
import { createRecordTestResultTool } from "@/inngest/tools/record-test-result";
import { createRecordBugTool } from "@/inngest/tools/record-bug";
import { createBrowserActionTool } from "@/inngest/tools/browser-action";
import { createListUserEnvsTool } from "@/inngest/tools/list-user-envs-tool";
import { createInjectUserEnvsTool } from "@/inngest/tools/inject-user-envs";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";
import { listUserEnvs } from "@/inngest/tools/list-user-envs";

interface TestAgentState {
    jobId: string;
    summary: string;
    testFiles: Record<string, string>;
    discoveryInfo: {
        entryPoint?: string;
        framework?: string;
        moduleType?: string;
        backendEntryPoint?: string;
        frontendEntryPoint?: string;
        backendFramework?: string;
        frontendFramework?: string;
        endpoints?: Array<{ method: string; path: string; file: string }>;
        envVarsNeeded?: string[];
        databaseUsed?: boolean;
        userVault?: {
            available: string[];
            lastUsed: Record<string, string>;
            serviceMapping: Record<string, string>;
        };
    };
    serverInfo: {
        port?: number;
        sandboxUrl?: string;
        startCommand?: string;
        isRunning?: boolean;
        backendPort?: number;
        backendUrl?: string;
        backendStartCommand?: string;
        backendRunning?: boolean;
        frontendPort?: number;
        frontendUrl?: string;
        frontendStartCommand?: string;
        frontendRunning?: boolean;
    };
    testResults: Array<{
        testFile: string;
        testName: string;
        featureName?: string;
        type?: "backend" | "full-stack";
        status: 'PASS' | 'FAIL' | 'ERROR';
        exitCode?: number;
        output?: string;
        screenshotUrl?: string;
        steps?: string[];
        networkAssertions?: Array<{
            url: string;
            method: string;
            expectedStatus: number;
            actualStatus: number;
            passed: boolean;
        }>;
        uiAssertions?: Array<{
            selector: string;
            expected: string;
            actual: string;
            passed: boolean;
        }>;
        executedAt?: string;
    }>;
    detectedErrors: Array<{
        testFile: string;
        testName?: string;
        message: string;
        sourceFile?: string;
        rootCause?: string;
        affectedLayer?: "frontend" | "backend" | "both";
        suggestedFixes?: Array<{
            type: "modify" | "new";
            filePath: string;
            existingSnippet?: string;
            updatedSnippet: string;
        }>;
    }>;
}

export const testAgentFunction = inngest.createFunction(
    {
        id: "test-agent",
        cancelOn: [
            {
                event: "test-agent/cancel",
                if: "async.data.jobId == event.data.jobId",
            },
        ],
    },
    {
        event: "test-agent/run",
    },
    async ({ event, step }) => {
        const { jobId, userId, repoUrl, bugDescription, testingMode = "fast", testingScope = "auto" } = event.data as {
            jobId: string;
            userId: string;
            repoUrl: string;
            bugDescription: string;
            testingMode?: TestingMode;
            testingScope?: TestingScope;
        };
        const runStartedMs = Date.now();
        const setupStartedMs = Date.now();
        let testStartedMs = 0;

        const logEvent = async (
            eventType: "STATUS" | "INFRA" | "DISCOVERY" | "SERVER" | "TEST_RESULT" | "BUG" | "SUMMARY" | "ERROR",
            payload?: Record<string, unknown>
        ) => {
            try {
                await prisma.jobRunEvent.create({
                    data: {
                        jobId,
                        eventType,
                        payload: (payload || {}) as Prisma.InputJsonValue,
                    },
                });
            } catch {
                // Best-effort logging only.
            }
        };

        try {
            // Update status: ANALYZING
            await step.run("update-status-analyzing", async () => {
                await prisma.job.update({
                    where: { id: jobId },
                    data: {
                        status: "ANALYZING",
                        startedAt: new Date(),
                    },
                });
            });
            await logEvent("STATUS", { status: "ANALYZING" });

            /* ---------------- Sandbox ---------------- */

            const sandboxId = await step.run("get-sandbox-id", async () => {
                const sandbox = await Sandbox.create("code-sentinel-dev");
                await sandbox.setTimeout(SANDBOX_TIMEOUT);

                // Start the browser client daemon in the background
                // Uses detached execution so it doesn't block Inngest steps
                await sandbox.commands.run("nohup npm run browser-client > /home/user/browser-client.log 2>&1 &");

                // Save sandbox info to job
                await prisma.job.update({
                    where: { id: jobId },
                    data: {
                        sandboxId: sandbox.sandboxId,
                    },
                });

                return sandbox.sandboxId;
            });
            await logEvent("INFRA", { action: "sandbox_created", sandboxId });

            await step.run("clone-repo", async () => {
                const sandbox = await getSandbox(sandboxId);
                await sandbox.commands.run(`
            rm -rf repo &&
            git clone --depth=1 ${repoUrl} repo
          `);
            });
            await logEvent("INFRA", { action: "repo_cloned", repoUrl });

            // Update status: SETTING_UP
            await step.run("update-status-setup", async () => {
                await prisma.job.update({
                    where: { id: jobId },
                    data: { status: "SETTING_UP" },
                });
            });
            await logEvent("STATUS", { status: "SETTING_UP" });

            const userVault = await step.run("load-user-vault-metadata", async () => {
                const vault = await listUserEnvs({ userId, db: prisma });
                const currentJob = await prisma.job.findUnique({
                    where: { id: jobId },
                    select: { discoveryInfo: true },
                });
                const currentDiscoveryInfo =
                    typeof currentJob?.discoveryInfo === "object" && currentJob.discoveryInfo !== null
                        ? (currentJob.discoveryInfo as Record<string, unknown>)
                        : {};

                await prisma.job.update({
                    where: { id: jobId },
                    data: {
                        discoveryInfo: {
                            ...currentDiscoveryInfo,
                            userVault: vault,
                        } as Prisma.InputJsonValue,
                    },
                });

                return vault;
            });
            await logEvent("DISCOVERY", {
                action: "user_vault_loaded",
                availableKeys: userVault.available,
            });

            /* ---------------- State ---------------- */

            const state = createState<TestAgentState>({
                jobId,
                summary: "",
                testFiles: {},
                discoveryInfo: {
                    userVault,
                },
                serverInfo: {},
                testResults: [],
                detectedErrors: [],
            });

            // Update status: TESTING
            await step.run("update-status-testing", async () => {
                await prisma.job.update({
                    where: { id: jobId },
                    data: { status: "TESTING" },
                });
            });
            await logEvent("STATUS", { status: "TESTING" });
            const setupDurationMs = Date.now() - setupStartedMs;
            testStartedMs = Date.now();

            /* ---------------- Agent ---------------- */

            const testAgent = createAgent<TestAgentState>({
                name: "test-agent",
                system: TEST_AGENT_PROMPT(testingMode, testingScope),
                model: openai({
                    model: "claude-haiku-4.5",
                    apiKey: "dummy",
                    baseUrl: "http://localhost:4141",
                    // defaultParameters: {
                    //     max_tokens: 4096,
                    // },
                }),
                tools: [
                    createTerminalTool({ sandboxId }),
                    createOrUpdateFilesTool({ sandboxId }),
                    createReadFilesTool({ sandboxId }),
                    createEnvTool({ sandboxId }),
                    createMongoDbTool({ sandboxId }),
                    createListUserEnvsTool({ userId, db: prisma }),
                    createInjectUserEnvsTool({ sandboxId, userId, db: prisma }),
                    createGetServerUrlTool({ sandboxId }),
                    createUpdateDiscoveryTool({ jobId }),
                    createUpdateServerInfoTool({ jobId }),
                    createRecordTestResultTool({ jobId, sandboxId }),
                    createRecordBugTool({ jobId }),
                    createBrowserActionTool({ sandboxId }),
                ],
                lifecycle: {
                    onResponse: async ({ result, network }) => {
                        const text = lastAssistantTextMessageContent(result);

                        if (
                            text &&
                            network &&
                            text.includes("<task_summary>") &&
                            !network.state.data.summary
                        ) {
                            network.state.data.summary = text;

                            // Save summary to database
                            await prisma.job.update({
                                where: { id: jobId },
                                data: { summary: text },
                            });
                            await logEvent("SUMMARY", { source: "agent", captured: true });
                        }

                        return result;
                    },
                },
            });

            /* ---------------- Network ---------------- */

            const network = createNetwork<TestAgentState>({
                name: "test-agent-network",
                agents: [testAgent],
                defaultState: state,
                router: async ({ network }) => {
                    if (network.state.data.summary) return;
                    return testAgent;
                },
            });

            const result = await network.run(
                `[TESTING MODE: ${testingMode.toUpperCase()}]\n[TESTING SCOPE: ${testingScope.toUpperCase()}]\n[USER VAULT KEYS: ${userVault.available.join(", ") || "none"}]\n\n${bugDescription}`,
                { state }
            );
            const testDurationMs = testStartedMs > 0 ? Date.now() - testStartedMs : 0;

            // Final update: Fetch all data from database and update job
            const finalData = await step.run("finalize-and-save", async () => {
                // Fetch the complete job data with all related records
                const job = await prisma.job.findUnique({
                    where: { id: jobId },
                    include: {
                        tests: { orderBy: { createdAt: "desc" } },
                        bugs: { orderBy: { createdAt: "desc" } },
                    },
                });

                if (!job) {
                    throw new Error("Job not found");
                }

                // Extract data from result state
                const summary = result.state.data.summary || "";
                const testFiles = result.state.data.testFiles || {};
                const discoveryInfo = job.discoveryInfo || {};
                const serverInfo = job.serverInfo || {};
                const wasCancelledByUser =
                    job.status === "FAILED" && job.summary === "Canceled by user.";

                // Build testResults array from database Test records
                const testResults = job.tests.map(test => ({
                    testFile: test.testFile,
                    testName: test.testName,
                    featureName: test.featureName || undefined,
                    type: (test.type === "FULL_STACK" ? "full-stack" : "backend") as "backend" | "full-stack",
                    status: test.status,
                    exitCode: test.exitCode,
                    output: test.output,
                    screenshotUrl: test.screenshotUrl || undefined,
                    steps: Array.isArray(test.steps) ? (test.steps as string[]) : undefined,
                    networkAssertions: Array.isArray(test.networkAssertions)
                        ? (test.networkAssertions as TestAgentState["testResults"][number]["networkAssertions"])
                        : undefined,
                    uiAssertions: Array.isArray(test.uiAssertions)
                        ? (test.uiAssertions as TestAgentState["testResults"][number]["uiAssertions"])
                        : undefined,
                    executedAt: test.createdAt.toISOString(),
                }));

                // Build detectedErrors array from database Bug records
                const detectedErrors = job.bugs.map(bug => ({
                    message: bug.message,
                    testFile: bug.testFile,
                    testName: bug.testName,
                    sourceFile: bug.sourceFile,
                    rootCause: bug.rootCause,
                    affectedLayer:
                        bug.affectedLayer === "FRONTEND"
                            ? "frontend"
                            : bug.affectedLayer === "BACKEND"
                                ? "backend"
                                : bug.affectedLayer === "BOTH"
                                    ? "both"
                                    : undefined,
                    suggestedFixes: bug.suggestedFixes as TestAgentState["detectedErrors"][number]["suggestedFixes"],
                }));

                // Avoid overriding a user cancellation if it happened mid-run.
                if (!wasCancelledByUser) {
                    await prisma.job.update({
                        where: { id: jobId },
                        data: {
                            status: "COMPLETED",
                            completedAt: new Date(),
                            summary,
                            setupDurationMs,
                            testDurationMs,
                            totalDurationMs: Date.now() - runStartedMs,
                            totalTests: job.tests.length,
                            passedTests: job.tests.filter((t) => t.status === "PASS").length,
                            failedTests: job.tests.filter((t) => t.status === "FAIL").length,
                            errorTests: job.tests.filter((t) => t.status === "ERROR").length,
                            totalBugs: job.bugs.length,
                        },
                    });
                    await logEvent("STATUS", { status: "COMPLETED" });
                    await logEvent("SUMMARY", {
                        totalTests: job.tests.length,
                        passedTests: job.tests.filter((t) => t.status === "PASS").length,
                        failedTests: job.tests.filter((t) => t.status === "FAIL").length,
                        errorTests: job.tests.filter((t) => t.status === "ERROR").length,
                        totalBugs: job.bugs.length,
                    });
                }

                return {
                    summary: wasCancelledByUser ? (job.summary ?? summary) : summary,
                    testFiles,
                    discoveryInfo,
                    serverInfo,
                    testResults,
                    detectedErrors,
                    wasCancelledByUser,
                };
            });

            /* ---------------- Return ---------------- */

            return {
                jobId,
                status: finalData.wasCancelledByUser ? "FAILED" : "COMPLETED",
                summary: finalData.summary,
                testFiles: finalData.testFiles,
                discoveryInfo: finalData.discoveryInfo,
                serverInfo: finalData.serverInfo,
                testResults: finalData.testResults,
                detectedErrors: finalData.detectedErrors,
            };
        } catch (error) {
            await logEvent("ERROR", {
                message: error instanceof Error ? error.message : "Unknown error",
            });
            const existing = await prisma.job.findUnique({
                where: { id: jobId },
                select: { status: true, summary: true },
            });

            const wasCancelledByUser =
                existing?.status === "FAILED" && existing.summary === "Canceled by user.";

            if (!wasCancelledByUser) {
                // Update status: FAILED
                await prisma.job.update({
                    where: { id: jobId },
                    data: {
                        status: "FAILED",
                        completedAt: new Date(),
                        totalDurationMs: Date.now() - runStartedMs,
                    },
                });
                await logEvent("STATUS", { status: "FAILED" });
            }

            throw error;
        }
    }
);

import { inngest } from "./client";
import {
    createAgent,
    createState,
    createNetwork,
    openai,
} from "@inngest/agent-kit";
import { Sandbox } from "@e2b/code-interpreter";
import { SANDBOX_TIMEOUT } from "@/inngest/types";
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
import { prisma } from "@/lib/prisma";

interface TestAgentState {
    jobId: string;
    summary: string;
    testFiles: Record<string, string>;
    discoveryInfo: {
        entryPoint?: string;
        framework?: string;
        moduleType?: string;
        endpoints?: Array<{ method: string; path: string; file: string }>;
        envVarsNeeded?: string[];
        databaseUsed?: boolean;
    };
    serverInfo: {
        port?: number;
        sandboxUrl?: string;
        startCommand?: string;
        isRunning?: boolean;
    };
    testResults: Array<{
        testFile: string;
        testName: string;
        status: 'PASS' | 'FAIL' | 'ERROR';
        exitCode?: number;
        output?: string;
        executedAt?: string;
    }>;
    detectedErrors: Array<{
        testFile: string;
        testName?: string;
        message: string;
        sourceFile?: string;
        rootCause?: string;
        suggestedFixes?: Array<{
            type: "modify" | "new";
            filePath: string;
            existingSnippet?: string;
            updatedSnippet: string;
        }>;
    }>;
}

export const testAgentFunction = inngest.createFunction(
    { id: "test-agent" },
    { event: "test-agent/run" },
    async ({ event, step }) => {
        const { jobId, repoUrl, bugDescription } = event.data;

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

            /* ---------------- Sandbox ---------------- */

            const sandboxId = await step.run("get-sandbox-id", async () => {
                const sandbox = await Sandbox.create("code-sentinel-dev");
                await sandbox.setTimeout(SANDBOX_TIMEOUT);

                // Save sandbox info to job
                await prisma.job.update({
                    where: { id: jobId },
                    data: {
                        sandboxId: sandbox.sandboxId,
                    },
                });

                return sandbox.sandboxId;
            });

            await step.run("clone-repo", async () => {
                const sandbox = await getSandbox(sandboxId);
                await sandbox.commands.run(`
            rm -rf repo &&
            git clone --depth=1 ${repoUrl} repo
          `);
            });

            // Update status: SETTING_UP
            await step.run("update-status-setup", async () => {
                await prisma.job.update({
                    where: { id: jobId },
                    data: { status: "SETTING_UP" },
                });
            });

            /* ---------------- State ---------------- */

            const state = createState<TestAgentState>({
                jobId,
                summary: "",
                testFiles: {},
                discoveryInfo: {},
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

            /* ---------------- Agent ---------------- */

            const testAgent = createAgent<TestAgentState>({
                name: "test-agent",
                system: TEST_AGENT_PROMPT,
                model: openai({
                    model: "gpt-4.1-mini",
                    baseUrl: process.env.AI_PIPE_URL,
                    apiKey: process.env.AI_PIPE_KEY,
                    defaultParameters: { temperature: 0.1 },
                }),
                tools: [
                    createTerminalTool({ sandboxId }),
                    createOrUpdateFilesTool({ sandboxId }),
                    createReadFilesTool({ sandboxId }),
                    createEnvTool({ sandboxId }),
                    createMongoDbTool({ sandboxId }),
                    createGetServerUrlTool({ sandboxId }),
                    createUpdateDiscoveryTool({ jobId }),
                    createUpdateServerInfoTool({ jobId }),
                    createRecordTestResultTool({ jobId }),
                    createRecordBugTool({ jobId }),
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

            const result = await network.run(bugDescription, { state });

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

                // Build testResults array from database Test records
                const testResults = job.tests.map(test => ({
                    testFile: test.testFile,
                    testName: test.testName,
                    status: test.status,
                    exitCode: test.exitCode,
                    output: test.output,
                    executedAt: test.createdAt.toISOString(),
                }));

                // Build detectedErrors array from database Bug records
                const detectedErrors = job.bugs.map(bug => ({
                    message: bug.message,
                    testFile: bug.testFile,
                    testName: bug.testName,
                    sourceFile: bug.sourceFile,
                    rootCause: bug.rootCause,
                    suggestedFixes: bug.suggestedFixes as TestAgentState["detectedErrors"][number]["suggestedFixes"],
                }));

                // Update job with final status and summary
                await prisma.job.update({
                    where: { id: jobId },
                    data: {
                        status: "COMPLETED",
                        completedAt: new Date(),
                        summary,
                    },
                });

                return {
                    summary,
                    testFiles,
                    discoveryInfo,
                    serverInfo,
                    testResults,
                    detectedErrors,
                };
            });

            /* ---------------- Return ---------------- */

            return {
                jobId,
                status: "COMPLETED" as const,
                summary: finalData.summary,
                testFiles: finalData.testFiles,
                discoveryInfo: finalData.discoveryInfo,
                serverInfo: finalData.serverInfo,
                testResults: finalData.testResults,
                detectedErrors: finalData.detectedErrors,
            };
        } catch (error) {
            // Update status: FAILED
            await prisma.job.update({
                where: { id: jobId },
                data: {
                    status: "FAILED",
                    completedAt: new Date(),
                },
            });

            throw error;
        }
    }
);

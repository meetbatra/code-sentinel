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

interface TestAgentState {
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
    }>;
}

export const testAgentFunction = inngest.createFunction(
    { id: "test-agent" },
    { event: "test-agent/run" },
    async ({ event, step }) => {
        /* ---------------- Sandbox ---------------- */

        const sandboxId = await step.run("get-sandbox-id", async () => {
            const sandbox = await Sandbox.create("code-sentinel-dev");
            await sandbox.setTimeout(SANDBOX_TIMEOUT);
            return sandbox.sandboxId;
        });

        await step.run("clone-repo", async () => {
            const sandbox = await getSandbox(sandboxId);
            await sandbox.commands.run(`
        rm -rf repo &&
        git clone --depth=1 ${event.data.repoUrl} repo
      `);
        });

        /* ---------------- State ---------------- */

        const state = createState<TestAgentState>({
            summary: "",
            testFiles: {},
            discoveryInfo: {},
            serverInfo: {},
            testResults: [],
            detectedErrors: [],
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
                createUpdateDiscoveryTool(),
                createUpdateServerInfoTool(),
                createRecordTestResultTool(),
                createRecordBugTool(),
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
                    }

                    return result;
                },
            },
        });

        /* ---------------- Network (THE FIX) ---------------- */

        const network = createNetwork<TestAgentState>({
            name: "test-agent-network",
            agents: [testAgent],
            defaultState: state,
            router: async ({ network }) => {
                if (network.state.data.summary) return;
                return testAgent;
            },
        });

        const result = await network.run(event.data.value, { state });

        /* ---------------- Return ---------------- */

        return {
            summary: result.state.data.summary,
            testFiles: result.state.data.testFiles,
            discoveryInfo: result.state.data.discoveryInfo,
            serverInfo: result.state.data.serverInfo,
            testResults: result.state.data.testResults,
            detectedErrors: result.state.data.detectedErrors,
        };
    }
);

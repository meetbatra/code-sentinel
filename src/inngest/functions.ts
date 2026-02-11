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
import {createGetServerUrlTool} from "@/inngest/tools/get-server-url";

interface TestAgentState {
    summary: string;
    testFiles: Record<string, string>;
    detectedErrors: {
        testFile: string;
        testName?: string;
        message: string;
        sourceFile?: string;
    }[];
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
            detectedErrors: [],
        });

        /* ---------------- Agent ---------------- */

        const testAgent = createAgent<TestAgentState>({
            name: "test-agent",
            system: TEST_AGENT_PROMPT,
            model: openai({
                model: "openai/gpt-4.1-mini",
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
            detectedErrors: result.state.data.detectedErrors,
        };
    }
);

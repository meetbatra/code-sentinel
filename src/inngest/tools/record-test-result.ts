import { z } from "zod";
import { createTool } from "@inngest/agent-kit";

export const createRecordTestResultTool = () => {
    return createTool({
        name: "recordTestResult",
        description: "Record the result of a test execution. Call this after running each test file.",
        parameters: z.object({
            testFile: z.string().describe("Path to the test file"),
            testName: z.string().describe("Descriptive name of what was tested"),
            status: z.enum(["PASS", "FAIL", "ERROR"]).describe("Test result status"),
            exitCode: z.number().describe("Process exit code").default(0),
            output: z.string().describe("Test output or error message").default(""),
        }),
        handler: async (params, { step: toolStep, network }) => {
            if (!network) {
                return "Error: Network not available";
            }

            try {
                const newEntry = await toolStep?.run("record-test-result", async () => {
                    return {
                        testFile: params.testFile,
                        testName: params.testName,
                        status: params.status,
                        exitCode: params.exitCode || undefined,
                        output: params.output || undefined,
                        executedAt: new Date().toISOString(),
                    };
                });

                if (network && newEntry) {
                    const testResults = network.state.data.testResults || [];
                    testResults.push(newEntry);
                    network.state.data.testResults = testResults;
                }

                return `Recorded ${params.status} result for ${params.testFile}`;
            } catch (error) {
                return `Error recording test result: ${error instanceof Error ? error.message : "Unknown error"}`;
            }
        },
    });
};



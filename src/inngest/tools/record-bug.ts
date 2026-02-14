import { z } from "zod";
import { createTool } from "@inngest/agent-kit";

export const createRecordBugTool = () => {
    return createTool({
        name: "recordBug",
        description: "Record a detected bug/error. Call this when a test confirms a bug exists.",
        parameters: z.object({
            testFile: z.string().describe("Test file that detected the bug"),
            testName: z.string().describe("Name of the test that caught it").default(""),
            message: z.string().describe("Bug description"),
            sourceFile: z.string().describe("Source file containing the bug").default(""),
            rootCause: z.string().describe("Explanation of why the bug occurs").default(""),
        }),
        handler: async (params, { step: toolStep, network }) => {
            if (!network) {
                return "Error: Network not available";
            }

            try {
                const newError = await toolStep?.run("record-bug", async () => {
                    return {
                        testFile: params.testFile,
                        testName: params.testName || undefined,
                        message: params.message,
                        sourceFile: params.sourceFile || undefined,
                        rootCause: params.rootCause || undefined,
                    };
                });

                if (network && newError) {
                    const detectedErrors = network.state.data.detectedErrors || [];
                    detectedErrors.push(newError);
                    network.state.data.detectedErrors = detectedErrors;
                }

                return `Recorded bug: ${params.message}`;
            } catch (error) {
                return `Error recording bug: ${error instanceof Error ? error.message : "Unknown error"}`;
            }
        },
    });
};



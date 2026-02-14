import { z } from "zod";
import { createTool } from "@inngest/agent-kit";
import { prisma } from "@/lib/prisma";

interface RecordBugOptions {
    jobId: string;
}

export const createRecordBugTool = ({ jobId }: RecordBugOptions) => {
    return createTool({
        name: "recordBug",
        description: "Record a detected bug/error. Call this when a test confirms a bug exists.",
        parameters: z.object({
            testFile: z.string().describe("Test file that detected the bug"),
            testName: z.string().describe("Name of the test that caught it").default(""),
            message: z.string().describe("Bug description"),
            sourceFile: z.string().describe("Source file containing the bug").default(""),
            rootCause: z.string().describe("Explanation of why the bug occurs").default(""),
            confidence: z.enum(["LOW", "MEDIUM", "HIGH"]).describe("Confidence level of the bug detection").default("MEDIUM"),
        }),
        handler: async (params, { step: toolStep, network }) => {
            if (!network) {
                return "Error: Network not available";
            }

            try {
                return await toolStep?.run("record-bug", async () => {
                    const bugData = {
                        testFile: params.testFile,
                        testName: params.testName || undefined,
                        message: params.message,
                        sourceFile: params.sourceFile || undefined,
                        rootCause: params.rootCause || undefined,
                    };

                    // Update agent state
                    if (network) {
                        const detectedErrors = network.state.data.detectedErrors || [];
                        detectedErrors.push(bugData);
                        network.state.data.detectedErrors = detectedErrors;
                    }

                    // Save to database
                    await prisma.bug.create({
                        data: {
                            jobId,
                            message: params.message,
                            rootCause: params.rootCause || null,
                            sourceFile: params.sourceFile || null,
                            testFile: params.testFile,
                            testName: params.testName || null,
                            confidence: params.confidence,
                        },
                    });

                    return `Recorded bug: ${params.message}`;
                }) || `Recorded bug: ${params.message}`;
            } catch (error) {
                return `Error recording bug: ${error instanceof Error ? error.message : "Unknown error"}`;
            }
        },
    });
};

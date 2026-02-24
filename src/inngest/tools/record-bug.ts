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
            suggestedFixes: z
                .array(
                    z.object({
                        type: z.enum(["modify", "new"]).describe("Whether to modify an existing file or create a new file"),
                        filePath: z.string().min(1).max(400).describe("Path to the file to modify or create"),
                        existingSnippet: z.string().max(20000).describe("Exact snippet from the existing file to be replaced (required for modify)").default(""),
                        updatedSnippet: z.string().max(20000).describe("Updated snippet or full file content (for new files)"),
                    })
                )
                .max(8)
                .describe("Suggested code changes to fix the bug")
                .default([]),
        }),
        handler: async (params, { step: toolStep, network }) => {
            if (!network) {
                return "Error: Network not available";
            }

            try {
                return await toolStep?.run("record-bug", async () => {
                    // Basic logical validation
                    const invalidFix = params.suggestedFixes.find(
                        (fix) => fix.type === "modify" && !fix.existingSnippet.trim()
                    );
                    if (invalidFix) {
                        return "Error recording bug: modify fixes must include existingSnippet";
                    }

                    // Size guard: prevent huge payloads
                    try {
                        const totalBytes = Buffer.byteLength(JSON.stringify(params.suggestedFixes), 'utf8');
                        const MAX_BYTES = 200 * 1024; // 200 KB
                        if (totalBytes > MAX_BYTES) {
                            return `Error recording bug: suggestedFixes payload too large (${totalBytes} bytes)`;
                        }
                    } catch (e) {
                        return "Error recording bug: could not validate suggestedFixes size";
                    }

                    const bugData = {
                        testFile: params.testFile,
                        testName: params.testName || undefined,
                        message: params.message,
                        sourceFile: params.sourceFile || undefined,
                        rootCause: params.rootCause || undefined,
                        suggestedFixes: params.suggestedFixes,
                    };

                    // Update agent state
                    if (network) {
                        const detectedErrors = network.state.data.detectedErrors || [];
                        detectedErrors.push(bugData);
                        network.state.data.detectedErrors = detectedErrors;
                    }

                    // Save to database (persist suggestedFixes only when present)
                    await prisma.bug.create({
                        data: {
                            jobId,
                            message: params.message,
                            rootCause: params.rootCause || null,
                            sourceFile: params.sourceFile || null,
                            testFile: params.testFile,
                            testName: params.testName || null,
                            confidence: params.confidence,
                            ...(params.suggestedFixes && params.suggestedFixes.length > 0
                                ? { suggestedFixes: params.suggestedFixes }
                                : {}),
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

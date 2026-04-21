import { z } from "zod";
import { createTool } from "@inngest/agent-kit";
import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";

interface RecordBugOptions {
    jobId: string;
}

type BugAffectedLayer = "FRONTEND" | "BACKEND" | "BOTH";

export const createRecordBugTool = ({ jobId }: RecordBugOptions) => {
    return createTool({
        name: "recordBug",
        description: "Record a detected bug/error. Call this when a test confirms a bug exists.",
        parameters: z.object({
            testFile: z.string().describe("Test file that detected the bug"),
            testName: z.string().describe("Name of the test that caught it"),
            message: z.string().describe("Bug description"),
            sourceFile: z.string().describe("Source file containing the bug"),
            rootCause: z.string().describe("Explanation of why the bug occurs"),
            confidence: z.enum(["LOW", "MEDIUM", "HIGH"]).describe("Confidence level of the bug detection"),
            affectedLayer: z.enum(["frontend", "backend", "both"]).nullable().describe("Which application layer is impacted"),
            suggestedFixes: z
                .array(
                    z.object({
                        type: z.enum(["modify", "new"]).describe("Whether to modify an existing file or create a new file"),
                        filePath: z.string().min(1).max(400).describe("Path to the file to modify or create"),
                        existingSnippet: z.string().max(20000).describe("Exact snippet from the existing file to be replaced (required for modify)"),
                        updatedSnippet: z.string().max(20000).describe("Updated snippet or full file content (for new files)"),
                    })
                )
                .max(8)
                .describe("Suggested code changes to fix the bug"),
        }),
        handler: async (params, { step: toolStep, network }) => {
            if (!network) {
                return "Error: Network not available";
            }

            try {
                return await toolStep?.run("record-bug", async () => {
                    const dbAffectedLayer: BugAffectedLayer | null =
                        params.affectedLayer === "frontend"
                            ? "FRONTEND"
                            : params.affectedLayer === "backend"
                                ? "BACKEND"
                                : params.affectedLayer === "both"
                                    ? "BOTH"
                                    : null;

                    // Basic logical validation
                    const invalidFix = params.suggestedFixes.find(
                        (fix) => fix.type === "modify" && !fix.existingSnippet.trim()
                    );
                    if (invalidFix) {
                        return "Error recording bug: modify fixes must include existingSnippet";
                    }

                    // Size guard: per-item and total payload checks
                    try {
                        const fixes = params.suggestedFixes || [];
                        // Per-item checks: modify -> small snippets, new -> allow larger full-file but capped
                        const MAX_MODIFY_SNIPPET = 20000; // 20 KB
                        const MAX_NEW_FILE = 1024 * 1024; // 1 MB per new file
                        const MAX_TOTAL = 2 * 1024 * 1024; // 2 MB total across all fixes
                        let totalBytes = 0;
                        for (const fix of fixes) {
                            if (fix.type === 'modify') {
                                if ((fix.existingSnippet || '').length === 0) {
                                    return 'Error recording bug: modify fixes must include existingSnippet';
                                }
                                if ((fix.existingSnippet || '').length > MAX_MODIFY_SNIPPET || (fix.updatedSnippet || '').length > MAX_MODIFY_SNIPPET) {
                                    return 'Error recording bug: modify fix snippets exceed allowed size (20KB)';
                                }
                                totalBytes += Buffer.byteLength(fix.existingSnippet || '', 'utf8') + Buffer.byteLength(fix.updatedSnippet || '', 'utf8');
                            } else if (fix.type === 'new') {
                                // updatedSnippet may be the full file for new files
                                if ((fix.updatedSnippet || '').length > MAX_NEW_FILE) {
                                    return `Error recording bug: new file content too large (${Buffer.byteLength(fix.updatedSnippet||'', 'utf8')} bytes)`;
                                }
                                totalBytes += Buffer.byteLength(fix.updatedSnippet || '', 'utf8');
                            } else {
                                return 'Error recording bug: unknown fix type';
                            }
                        }
                        if (totalBytes > MAX_TOTAL) {
                            return `Error recording bug: suggestedFixes total payload too large (${totalBytes} bytes)`;
                        }
                    } catch {
                        return "Error recording bug: could not validate suggestedFixes size";
                    }

                    const bugData = {
                        testFile: params.testFile,
                        testName: params.testName || undefined,
                        message: params.message,
                        sourceFile: params.sourceFile || undefined,
                    rootCause: params.rootCause || undefined,
                    affectedLayer: params.affectedLayer || undefined,
                    suggestedFixes: params.suggestedFixes,
                };

                    // Update agent state
                    if (network) {
                        const detectedErrors = network.state.data.detectedErrors || [];
                        detectedErrors.push(bugData);
                        network.state.data.detectedErrors = detectedErrors;
                    }

                    // Save to database (persist suggestedFixes only when present)
                    const fingerprint = createHash("sha1")
                        .update(
                            [
                                params.sourceFile || "unknown",
                                params.testName || "unknown",
                                params.message,
                                params.rootCause || "",
                            ].join("|")
                        )
                        .digest("hex");

                    await prisma.bug.create({
                        data: {
                            jobId,
                            message: params.message,
                            rootCause: params.rootCause || null,
                            sourceFile: params.sourceFile || null,
                            testFile: params.testFile,
                            testName: params.testName || null,
                            confidence: params.confidence,
                            affectedLayer: dbAffectedLayer,
                            fingerprint,
                            ...(params.suggestedFixes && params.suggestedFixes.length > 0
                                ? { suggestedFixes: params.suggestedFixes }
                                : {}),
                        },
                    });

                    await prisma.job.update({
                        where: { id: jobId },
                        data: {
                            totalBugs: { increment: 1 },
                        },
                    });

                    await prisma.jobRunEvent.create({
                        data: {
                            jobId,
                            eventType: "BUG",
                            payload: {
                                testFile: params.testFile,
                                testName: params.testName || null,
                                confidence: params.confidence,
                                affectedLayer: dbAffectedLayer,
                                sourceFile: params.sourceFile || null,
                                message: params.message,
                                fingerprint,
                            },
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

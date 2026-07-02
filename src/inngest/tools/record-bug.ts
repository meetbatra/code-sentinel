import { z } from "zod";
import { createTool } from "@inngest/agent-kit";
import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";

interface RecordBugOptions {
    jobId: string;
}

type BugAffectedLayer = "FRONTEND" | "BACKEND" | "BOTH";
type DbFindingType = "REPRODUCED_BUG" | "RUNTIME_RISK" | "CONFIG_GAP" | "CODE_QUALITY";
type DbReproductionStatus = "REPRODUCED" | "INFERRED" | "NOT_REPRODUCED";
type DbEvidenceType = "EXECUTABLE_TEST" | "HTTP_RESPONSE" | "BROWSER_FLOW" | "SOURCE_ANALYSIS" | "MIXED";
type DbFindingSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

function toDbFindingType(value: "reproduced_bug" | "runtime_risk" | "config_gap" | "code_quality"): DbFindingType {
    switch (value) {
        case "reproduced_bug":
            return "REPRODUCED_BUG";
        case "runtime_risk":
            return "RUNTIME_RISK";
        case "config_gap":
            return "CONFIG_GAP";
        case "code_quality":
            return "CODE_QUALITY";
    }
}

function toDbReproductionStatus(value: "reproduced" | "inferred" | "not_reproduced"): DbReproductionStatus {
    switch (value) {
        case "reproduced":
            return "REPRODUCED";
        case "inferred":
            return "INFERRED";
        case "not_reproduced":
            return "NOT_REPRODUCED";
    }
}

function toDbEvidenceType(value: "executable_test" | "http_response" | "browser_flow" | "source_analysis" | "mixed"): DbEvidenceType {
    switch (value) {
        case "executable_test":
            return "EXECUTABLE_TEST";
        case "http_response":
            return "HTTP_RESPONSE";
        case "browser_flow":
            return "BROWSER_FLOW";
        case "source_analysis":
            return "SOURCE_ANALYSIS";
        case "mixed":
            return "MIXED";
    }
}

function toDbSeverity(value: "critical" | "high" | "medium" | "low"): DbFindingSeverity {
    switch (value) {
        case "critical":
            return "CRITICAL";
        case "high":
            return "HIGH";
        case "medium":
            return "MEDIUM";
        case "low":
            return "LOW";
    }
}

export const createRecordBugTool = ({ jobId }: RecordBugOptions) => {
    return createTool({
        name: "recordBug",
        description: "Record a validated finding. Use reproduced_bug only for runtime-proven failures. Use runtime_risk, config_gap, or code_quality for inferred concerns.",
        parameters: z.object({
            testFile: z.string().describe("Test file that detected the bug"),
            testName: z.string().describe("Name of the test that caught it"),
            message: z.string().describe("Bug description"),
            sourceFile: z.string().describe("Source file containing the bug"),
            rootCause: z.string().describe("Explanation of why the bug occurs"),
            confidence: z.enum(["LOW", "MEDIUM", "HIGH"]).describe("Confidence level of the bug detection"),
            findingType: z.enum(["reproduced_bug", "runtime_risk", "config_gap", "code_quality"]).describe("Classify whether this is a runtime-proven bug or a lower-confidence inferred finding"),
            reproductionStatus: z.enum(["reproduced", "inferred", "not_reproduced"]).describe("Whether the issue was actually reproduced at runtime"),
            evidenceType: z.enum(["executable_test", "http_response", "browser_flow", "source_analysis", "mixed"]).describe("Primary source of evidence for this finding"),
            severity: z.enum(["critical", "high", "medium", "low"]).describe("User-impact severity, not code ugliness"),
            actualBehavior: z.string().max(4000).nullable().describe("Observed runtime behavior"),
            expectedBehavior: z.string().max(4000).nullable().describe("Expected correct behavior"),
            reproductionSteps: z.array(z.string().max(500)).max(20).nullable().describe("Short reproduction steps or execution flow"),
            evidenceSummary: z.string().max(4000).describe("Concise explanation of the concrete evidence backing the finding"),
            counterEvidence: z.string().max(4000).nullable().describe("Fallbacks, retries, or other counterevidence that reduced certainty or severity"),
            fallbackObserved: z.boolean().nullable().describe("Whether the app showed a fallback or graceful degradation path"),
            retryCount: z.number().int().min(0).describe("How many reruns/retries were attempted while validating the finding"),
            reproCount: z.number().int().min(0).describe("How many times the issue reproduced across attempts"),
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
                    const dbFindingType = toDbFindingType(params.findingType);
                    const dbReproductionStatus = toDbReproductionStatus(params.reproductionStatus);
                    const dbEvidenceType = toDbEvidenceType(params.evidenceType);
                    const dbSeverity = toDbSeverity(params.severity);

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

                    if (params.findingType === "reproduced_bug") {
                        if (params.reproductionStatus !== "reproduced") {
                            return "Error recording bug: reproduced_bug findings must use reproductionStatus='reproduced'";
                        }
                        if (params.evidenceType === "source_analysis") {
                            return "Error recording bug: reproduced_bug findings cannot use source_analysis as the sole evidence type";
                        }
                        if (!params.actualBehavior?.trim() || !params.expectedBehavior?.trim()) {
                            return "Error recording bug: reproduced_bug findings require actualBehavior and expectedBehavior";
                        }
                        if (!params.reproductionSteps || params.reproductionSteps.length === 0) {
                            return "Error recording bug: reproduced_bug findings require reproductionSteps";
                        }
                        if (params.reproCount < 1) {
                            return "Error recording bug: reproduced_bug findings require reproCount >= 1";
                        }
                    }

                    const bugData = {
                        testFile: params.testFile,
                        testName: params.testName || undefined,
                        message: params.message,
                        sourceFile: params.sourceFile || undefined,
                        rootCause: params.rootCause || undefined,
                        affectedLayer: params.affectedLayer || undefined,
                        findingType: params.findingType,
                        reproductionStatus: params.reproductionStatus,
                        evidenceType: params.evidenceType,
                        severity: params.severity,
                        actualBehavior: params.actualBehavior || undefined,
                        expectedBehavior: params.expectedBehavior || undefined,
                        reproductionSteps: params.reproductionSteps || undefined,
                        evidenceSummary: params.evidenceSummary,
                        counterEvidence: params.counterEvidence || undefined,
                        fallbackObserved: params.fallbackObserved ?? undefined,
                        retryCount: params.retryCount,
                        reproCount: params.reproCount,
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
                            findingType: dbFindingType,
                            reproductionStatus: dbReproductionStatus,
                            evidenceType: dbEvidenceType,
                            severity: dbSeverity,
                            actualBehavior: params.actualBehavior || null,
                            expectedBehavior: params.expectedBehavior || null,
                            reproductionSteps: params.reproductionSteps || undefined,
                            evidenceSummary: params.evidenceSummary,
                            counterEvidence: params.counterEvidence || null,
                            fallbackObserved: params.fallbackObserved ?? null,
                            retryCount: params.retryCount,
                            reproCount: params.reproCount,
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
                                findingType: dbFindingType,
                                reproductionStatus: dbReproductionStatus,
                                evidenceType: dbEvidenceType,
                                severity: dbSeverity,
                                fallbackObserved: params.fallbackObserved ?? null,
                                retryCount: params.retryCount,
                                reproCount: params.reproCount,
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

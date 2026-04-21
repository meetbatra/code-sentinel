import { z } from "zod";
import { createTool } from "@inngest/agent-kit";
import { prisma } from "@/lib/prisma";
import { createHash } from "crypto";
import path from "path";
import { getSandbox } from "@/inngest/utils";

interface RecordTestResultOptions {
    jobId: string;
    sandboxId?: string;
}

type TestResultStatus = "PASS" | "FAIL" | "ERROR";
type TestLayer = "BACKEND" | "FULL_STACK";

const testStatusSchema = z.enum(["PASS", "FAIL", "ERROR", "pass", "fail", "error"]);

const networkAssertionSchema = z.object({
    url: z.string().describe("Request URL"),
    method: z.string().describe("HTTP method"),
    expectedStatus: z.number().int().describe("Expected HTTP status code"),
    actualStatus: z.number().int().describe("Actual HTTP status code"),
    passed: z.boolean().describe("Whether assertion passed"),
});

const uiAssertionSchema = z.object({
    selector: z.string().describe("CSS selector of the asserted element"),
    expected: z.string().describe("Expected UI state/value"),
    actual: z.string().describe("Actual UI state/value"),
    passed: z.boolean().describe("Whether assertion passed"),
});

function getMimeTypeFromPath(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
    if (ext === ".webp") return "image/webp";
    if (ext === ".gif") return "image/gif";
    return "image/png";
}

function toSlug(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
}

async function uploadScreenshotToCloudinary(
    filePath: string,
    screenshotBytes: Uint8Array,
    publicId: string
): Promise<string> {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    if (!cloudName) {
        throw new Error("Missing CLOUDINARY_CLOUD_NAME");
    }

    const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
    const formData = new FormData();
    const fileName = path.basename(filePath) || "screenshot.png";
    const mimeType = getMimeTypeFromPath(filePath);

    formData.append("file", new Blob([Buffer.from(screenshotBytes)], { type: mimeType }), fileName);

    const folder = process.env.CLOUDINARY_FOLDER || "code-sentinel/screenshots";
    formData.append("folder", folder);
    formData.append("public_id", publicId);

    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
    if (uploadPreset) {
        formData.append("upload_preset", uploadPreset);
    } else {
        const apiKey = process.env.CLOUDINARY_API_KEY;
        const apiSecret = process.env.CLOUDINARY_API_SECRET;
        if (!apiKey || !apiSecret) {
            throw new Error("Missing Cloudinary credentials. Set CLOUDINARY_UPLOAD_PRESET or CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET");
        }

        const timestamp = Math.floor(Date.now() / 1000).toString();
        const signaturePayload = `folder=${folder}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
        const signature = createHash("sha1").update(signaturePayload).digest("hex");

        formData.append("api_key", apiKey);
        formData.append("timestamp", timestamp);
        formData.append("signature", signature);
    }

    const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cloudinary upload failed (${response.status}): ${errorText}`);
    }

    const payload = await response.json() as { secure_url?: string };
    if (!payload.secure_url) {
        throw new Error("Cloudinary response missing secure_url");
    }

    return payload.secure_url;
}

export const createRecordTestResultTool = ({ jobId, sandboxId }: RecordTestResultOptions) => {
    return createTool({
        name: "recordTestResult",
        description: "Record the result of a test execution. Call this after running each test file.",
        parameters: z.object({
            testFile: z.string().describe("Path to the test file"),
            testName: z.string().describe("Descriptive name of what was tested"),
            featureName: z.string().nullable().describe("Feature group label (e.g. Signup Validation)"),
            type: z.enum(["backend", "full-stack"]).describe("Testing layer for this result"),
            status: testStatusSchema.describe("Test result status"),
            exitCode: z.number().describe("Process exit code"),
            output: z.string().describe("Test output or error message"),
            screenshotPath: z.string().nullable().describe("Sandbox-local screenshot path. Tool uploads and stores public URL"),
            steps: z.array(z.string()).nullable().describe("Ordered steps performed for this edge case"),
            networkAssertions: z.array(networkAssertionSchema).nullable().describe("API/network checks for this edge case"),
            uiAssertions: z.array(uiAssertionSchema).nullable().describe("UI checks for this edge case"),
        }),
        handler: async (params, { step: toolStep, network }) => {
            if (!network) {
                return "Error: Network not available";
            }

            try {
                return await toolStep?.run("record-test-result", async () => {
                    const normalizedStatus = params.status.toUpperCase() as TestResultStatus;
                    const dbTestLayer: TestLayer = params.type === "full-stack" ? "FULL_STACK" : "BACKEND";
                    const isFullStack = params.type === "full-stack";
                    let screenshotUrl: string | undefined;
                    let screenshotUploadError: string | undefined;
                    let screenshotUploadedAt: Date | undefined;
                    let screenshotStorageProvider: string | undefined;
                    let uploadDurationMs = 0;
                    const warnings: string[] = [];

                    // Strict enforcement for full-stack screenshot evidence quality.
                    if (isFullStack) {
                        if (!params.screenshotPath) {
                            return "Error: full-stack recordTestResult requires screenshotPath. Capture screenshot right before recording.";
                        }
                        if (params.screenshotPath === "/home/user/screenshot.png") {
                            return "Error: full-stack screenshotPath must be unique per edge case. Do not use /home/user/screenshot.png.";
                        }
                        const usedPaths = (network.state.data.usedScreenshotPaths || []) as string[];
                        if (usedPaths.includes(params.screenshotPath)) {
                            return `Error: screenshotPath already used in this run (${params.screenshotPath}). Use a unique path per edge case.`;
                        }
                        network.state.data.usedScreenshotPaths = [...usedPaths, params.screenshotPath];
                    }

                    if (params.screenshotPath) {
                        if (!sandboxId) {
                            warnings.push("Screenshot upload skipped: sandboxId not available");
                            screenshotUploadError = "sandboxId not available";
                        } else {
                            try {
                                const uploadStart = Date.now();
                                const sandbox = await getSandbox(sandboxId);
                                const screenshotBytes = await sandbox.files.read(params.screenshotPath, { format: "bytes" });
                                const featurePart = toSlug(params.featureName || "feature");
                                const testPart = toSlug(params.testName || "edge-case");
                                const randomPart = Math.random().toString(36).slice(2, 8);
                                const publicId = `${featurePart}-${testPart}-${Date.now()}-${randomPart}`;
                                screenshotUrl = await uploadScreenshotToCloudinary(params.screenshotPath, screenshotBytes, publicId);
                                uploadDurationMs = Date.now() - uploadStart;
                                screenshotUploadedAt = new Date();
                                screenshotStorageProvider = "cloudinary";
                            } catch (uploadError) {
                                uploadDurationMs = uploadDurationMs || 0;
                                screenshotUploadError =
                                    uploadError instanceof Error ? uploadError.message : "Unknown error";
                                warnings.push(
                                    `Screenshot upload failed: ${screenshotUploadError}`
                                );
                            }
                        }
                    }

                    const testData = {
                        testFile: params.testFile,
                        testName: params.testName,
                        featureName: params.featureName || undefined,
                        type: params.type,
                        status: normalizedStatus,
                        exitCode: params.exitCode || undefined,
                        output: params.output || undefined,
                        screenshotUrl,
                        steps: params.steps || undefined,
                        networkAssertions: params.networkAssertions || undefined,
                        uiAssertions: params.uiAssertions || undefined,
                        executedAt: new Date().toISOString(),
                    };

                    // Update agent state
                    if (network) {
                        const testResults = network.state.data.testResults || [];
                        testResults.push(testData);
                        network.state.data.testResults = testResults;
                    }

                    // Get test file content from state
                    const testFileContent = network?.state?.data?.testFiles?.[params.testFile] || "";

                    // Save to database
                    await prisma.test.create({
                        data: {
                            jobId,
                            testFile: params.testFile,
                            testName: params.testName,
                            fileContent: testFileContent,
                            featureName: params.featureName || null,
                            type: dbTestLayer,
                            status: normalizedStatus,
                            exitCode: params.exitCode || null,
                            output: params.output || null,
                            screenshotUrl: screenshotUrl || null,
                            screenshotUploadedAt: screenshotUploadedAt || null,
                            screenshotUploadError: screenshotUploadError || null,
                            screenshotStorageProvider: screenshotStorageProvider || null,
                            steps: params.steps || undefined,
                            networkAssertions: params.networkAssertions || undefined,
                            uiAssertions: params.uiAssertions || undefined,
                            executedAt: new Date(),
                        },
                    });

                    // Maintain cached run counters + upload timing.
                    await prisma.job.update({
                        where: { id: jobId },
                        data: {
                            totalTests: { increment: 1 },
                            ...(normalizedStatus === "PASS"
                                ? { passedTests: { increment: 1 } }
                                : normalizedStatus === "FAIL"
                                    ? { failedTests: { increment: 1 } }
                                    : { errorTests: { increment: 1 } }),
                            ...(uploadDurationMs > 0
                                ? { artifactUploadDurationMs: { increment: uploadDurationMs } }
                                : {}),
                        },
                    });

                    await prisma.jobRunEvent.create({
                        data: {
                            jobId,
                            eventType: "TEST_RESULT",
                            payload: {
                                testFile: params.testFile,
                                testName: params.testName,
                                status: normalizedStatus,
                                type: dbTestLayer,
                                featureName: params.featureName || null,
                                hasScreenshot: Boolean(screenshotUrl),
                            },
                        },
                    });

                    if (warnings.length > 0) {
                        return `Recorded ${normalizedStatus} result for ${params.testFile} with warnings: ${warnings.join(" | ")}`;
                    }
                    return `Recorded ${normalizedStatus} result for ${params.testFile}`;
                }) || `Recorded ${params.status.toUpperCase()} result for ${params.testFile}`;
            } catch (error) {
                return `Error recording test result: ${error instanceof Error ? error.message : "Unknown error"}`;
            }
        },
    });
};

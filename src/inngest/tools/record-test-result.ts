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
            featureName: z.string().optional().describe("Feature group label (e.g. Signup Validation)"),
            type: z.enum(["backend", "full-stack"]).default("backend").describe("Testing layer for this result"),
            status: testStatusSchema.describe("Test result status"),
            exitCode: z.number().describe("Process exit code").default(0),
            output: z.string().describe("Test output or error message").default(""),
            screenshotPath: z.string().optional().describe("Sandbox-local screenshot path. Tool uploads and stores public URL"),
            steps: z.array(z.string()).optional().describe("Ordered steps performed for this edge case"),
            networkAssertions: z.array(networkAssertionSchema).optional().describe("API/network checks for this edge case"),
            uiAssertions: z.array(uiAssertionSchema).optional().describe("UI checks for this edge case"),
        }),
        handler: async (params, { step: toolStep, network }) => {
            if (!network) {
                return "Error: Network not available";
            }

            try {
                return await toolStep?.run("record-test-result", async () => {
                    const normalizedStatus = params.status.toUpperCase() as TestResultStatus;
                    let screenshotUrl: string | undefined;
                    const warnings: string[] = [];

                    if (params.screenshotPath) {
                        if (!sandboxId) {
                            warnings.push("Screenshot upload skipped: sandboxId not available");
                        } else {
                            try {
                                const sandbox = await getSandbox(sandboxId);
                                const screenshotBytes = await sandbox.files.read(params.screenshotPath, { format: "bytes" });
                                const featurePart = toSlug(params.featureName || "feature");
                                const testPart = toSlug(params.testName || "edge-case");
                                const randomPart = Math.random().toString(36).slice(2, 8);
                                const publicId = `${featurePart}-${testPart}-${Date.now()}-${randomPart}`;
                                screenshotUrl = await uploadScreenshotToCloudinary(params.screenshotPath, screenshotBytes, publicId);
                            } catch (uploadError) {
                                warnings.push(
                                    `Screenshot upload failed: ${uploadError instanceof Error ? uploadError.message : "Unknown error"}`
                                );
                            }
                        }
                    } else if (params.type === "full-stack") {
                        warnings.push("No screenshotPath provided for full-stack test result");
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
                            type: params.type,
                            status: normalizedStatus,
                            exitCode: params.exitCode || null,
                            output: params.output || null,
                            screenshotUrl: screenshotUrl || null,
                            steps: params.steps || undefined,
                            networkAssertions: params.networkAssertions || undefined,
                            uiAssertions: params.uiAssertions || undefined,
                            executedAt: new Date(),
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

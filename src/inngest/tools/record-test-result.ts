import { z } from "zod";
import { createTool } from "@inngest/agent-kit";
import { prisma } from "@/lib/prisma";

interface RecordTestResultOptions {
    jobId: string;
}

export const createRecordTestResultTool = ({ jobId }: RecordTestResultOptions) => {
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
                return await toolStep?.run("record-test-result", async () => {
                    const testData = {
                        testFile: params.testFile,
                        testName: params.testName,
                        status: params.status,
                        exitCode: params.exitCode || undefined,
                        output: params.output || undefined,
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
                            status: params.status,
                            exitCode: params.exitCode || null,
                            output: params.output || null,
                            executedAt: new Date(),
                        },
                    });

                    return `Recorded ${params.status} result for ${params.testFile}`;
                }) || `Recorded ${params.status} result for ${params.testFile}`;
            } catch (error) {
                return `Error recording test result: ${error instanceof Error ? error.message : "Unknown error"}`;
            }
        },
    });
};
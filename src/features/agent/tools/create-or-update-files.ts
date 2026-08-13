import { z } from "zod";
import { createTool } from "@inngest/agent-kit";

import { getSandbox } from "@/features/agent/utils";

interface CreateOrUpdateFilesToolOptions {
    sandboxId: string;
}

const paramsSchema = z.object({
    files: z.array(
        z.object({
            path: z.string(),
            content: z.string(),
        })
    ),
});

export const createOrUpdateFilesTool = ({
    sandboxId,
}: CreateOrUpdateFilesToolOptions) => {
    return createTool({
        name: "createOrUpdateFiles",
        description: "Create or update test files inside the repository",
        parameters: z.object({
            files: z
                .array(
                    z.object({
                        path: z
                            .string()
                            .describe("Path where the file should be created or updated"),
                        content: z
                            .string()
                            .describe("Content to write to the file"),
                    })
                )
                .describe("Array of files to create or update with their paths and content"),
        }),
        handler: async (params, { step: toolStep, network }) => {
            const parsed = paramsSchema.safeParse(params);
            if (!parsed.success) {
                return `Error: ${parsed.error.issues[0].message}`;
            }

            const { files } = parsed.data;

            try {
                const recordedTestFiles = new Set(network?.state.data.recordedTestFiles || []);
                const blockedFiles = files
                    .map((file) => file.path)
                    .filter((filePath, index, paths) => paths.indexOf(filePath) === index && recordedTestFiles.has(filePath));

                if (blockedFiles.length > 0) {
                    return `Error: these test files already have recorded results and are immutable: ${blockedFiles.join(", ")}. Do not run or update them again.`;
                }

                const updatedFiles = await toolStep?.run(
                    "createOrUpdateFiles",
                    async () => {
                        const sandbox = await getSandbox(sandboxId);
                        const currentFiles =
                            network?.state.data.testFiles ?? {};

                        for (const file of files) {
                            await sandbox.files.write(
                                `repo/${file.path}`,
                                file.content
                            );
                            currentFiles[file.path] = file.content;
                        }

                        return currentFiles;
                    }
                );

                if (network && typeof updatedFiles === "object") {
                    network.state.data.testFiles = updatedFiles;
                }

                const currentFilePaths = Object.keys(network?.state.data.testFiles || updatedFiles || {});
                return `Successfully created/updated ${files.length} file(s): ${files.map(f => f.path).join(", ")}. Current test files: ${currentFilePaths.join(", ")}`;
            } catch (error) {
                return `Failed to create or update files: ${error instanceof Error ? error.message : String(error)}`;
            }
        },
    });
};

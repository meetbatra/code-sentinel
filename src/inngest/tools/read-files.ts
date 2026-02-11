import { z } from "zod";
import { createTool } from "@inngest/agent-kit";

import { getSandbox } from "@/inngest/utils";

interface ReadFilesToolOptions {
    sandboxId: string;
}

const paramsSchema = z.object({
    files: z.array(z.string()),
});

export const createReadFilesTool = ({
    sandboxId,
}: ReadFilesToolOptions) => {
    return createTool({
        name: "readFiles",
        description: "Read files from the repository",
        parameters: z.object({
            files: z
                .array(z.string())
                .describe("Array of file paths to read from the repository"),
        }),
        handler: async (params, { step: toolStep }) => {
            const parsed = paramsSchema.safeParse(params);
            if (!parsed.success) {
                return `Error: ${parsed.error.issues[0].message}`;
            }

            const { files } = parsed.data;

            try {
                return (
                    await toolStep?.run("readFiles", async () => {
                        const sandbox = await getSandbox(sandboxId);
                        const results: { path: string; content: string }[] = [];

                        for (const file of files) {
                            const content = await sandbox.files.read(`repo/${file}`);
                            results.push({ path: file, content });
                        }

                        return JSON.stringify(results);
                    })
                );
            } catch (error) {
                return `Failed to read files: ${error instanceof Error ? error.message : String(error)}`;
            }
        },
    });
};


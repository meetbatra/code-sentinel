import {z} from "zod";
import {createTool} from "@inngest/agent-kit";

import {getSandbox} from "@/inngest/utils";

interface terminalToolOptions {
    sandboxId: string;
}

const paramsSchema = z.object({
    command: z.string(),
});

export const createTerminalTool = ({
    sandboxId
}: terminalToolOptions) => {
    return createTool({
        name: "terminal",
        description: "Run shell commands inside the repository",
        parameters: z.object({
            command: z
                .string()
                .describe("Command to run in the terminal"),
        }),
        handler: async (params, { step: toolStep }) => {
            const parsed = paramsSchema.safeParse(params);
            if(!parsed.success){
                return `Error: ${parsed.error.issues[0].message}`;
            }

            const { command } = parsed.data;

            try {
                return (
                    await toolStep?.run("terminal", async () => {
                        const buffers = { stdout: "", stderr: "" };
                        try {
                            const sandbox = await getSandbox(sandboxId);
                            const result = await sandbox.commands.run(
                                `cd repo && ${command}`,
                                {
                                    onStdout: (d: string) => {
                                        buffers.stdout += d
                                    },
                                    onStderr: (d: string) => {
                                        buffers.stderr += d
                                    },
                                }
                            );
                            return result.stdout;
                        } catch {
                            return `Command failed\nstdout:\n${buffers.stdout}\nstderr:\n${buffers.stderr}`;
                        }
                    })
                );
            } catch (error) {
                return `Error running command: ${error instanceof Error ? error.message : "Unknown error"}`;
            }
        },
    })
}
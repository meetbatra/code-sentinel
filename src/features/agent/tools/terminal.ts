import {z} from "zod";
import {createTool} from "@inngest/agent-kit";

import {getSandbox} from "@/features/agent/utils";

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
        description: "Run shell commands inside the repository. Test files with committed results are immutable and cannot be run again.",
        parameters: z.object({
            command: z
                .string()
                .describe("Command to run in the terminal"),
        }),
        handler: async (params, { step: toolStep, network }) => {
            const parsed = paramsSchema.safeParse(params);
            if(!parsed.success){
                return `Error: ${parsed.error.issues[0].message}`;
            }

            const { command } = parsed.data;

            const recordedTestFiles = network?.state.data.recordedTestFiles || [];
            const blockedFile = recordedTestFiles.find((filePath: string) => command.includes(filePath));
            if (blockedFile) {
                return `Error: ${blockedFile} already has a recorded result and is immutable. Do not run or update this test file again.`;
            }

            try {
                return await toolStep?.run("terminal", async () => {
                    const buffers = { stdout: "", stderr: "" };
                    try {
                        const sandbox = await getSandbox(sandboxId);
                        const fullCommand = command.trimStart().startsWith("cd repo")
                            ? command
                            : `cd repo && ${command}`;
                        const result = await sandbox.commands.run(
                            fullCommand,
                            {
                                onStdout: (d: string) => {
                                    buffers.stdout += d
                                },
                                onStderr: (d: string) => {
                                    buffers.stderr += d
                                },
                            }
                        );

                        if (result.error) {
                            return `Command failed\nstdout:\n${buffers.stdout}\nstderr:\n${buffers.stderr}`;
                        }

                        return result.stdout || buffers.stdout;
                    } catch (error) {
                        return `Command failed\nstdout:\n${buffers.stdout}\nstderr:\n${buffers.stderr}`;
                    }
                });
            } catch (error) {
                return `Error running command: ${error instanceof Error ? error.message : "Unknown error"}`;
            }
        },
    })
}

import { z } from "zod";
import { createTool } from "@inngest/agent-kit";
import { getSandbox } from "@/inngest/utils";

interface CreateEnvToolOptions {
    sandboxId: string;
}

const paramsSchema = z.object({
    envVars: z.array(
        z.object({
            key: z.string(),
            value: z.string(),
        })
    ),
    path: z.string().nullable().describe("Relative path from repo root to the .env file. Pass null to default to repo root."),
});

export const createEnvTool = ({ sandboxId }: CreateEnvToolOptions) => {
    return createTool({
        name: "createEnv",
        description: "Create or overwrite a .env file at specified path (default: repo root)",
        parameters: paramsSchema,
        handler: async (params, { step: toolStep }) => {
            const parsed = paramsSchema.safeParse(params);
            if (!parsed.success) {
                return `Error: ${parsed.error.issues[0].message}`;
            }

            const { envVars } = parsed.data;

            const envContent = envVars
                .map(({ key, value }) => `${key}=${value}`)
                .join("\n");

            try {
                const result = await toolStep?.run("createEnv", async () => {
                    const sandbox = await getSandbox(sandboxId);
                    const filePath = parsed.data.path || ".env";

                    await sandbox.files.write(`repo/${filePath}`, envContent);

                    return {
                        status: "env_created",
                        file: filePath,
                        vars_written: envVars.map(v => v.key),
                    };
                });

                if (result && typeof result === 'object' && 'vars_written' in result) {
                    return `Created .env file with ${result.vars_written.length} variable(s): ${result.vars_written.join(", ")}`;
                }

                return `Created .env file with ${envVars.length} variable(s)`;
            } catch (error) {
                return `Failed to create .env file: ${
                    error instanceof Error ? error.message : String(error)
                }`;
            }
        },
    });
};
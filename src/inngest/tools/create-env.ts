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
});

export const createEnvTool = ({ sandboxId }: CreateEnvToolOptions) => {
    return createTool({
        name: "createEnv",
        description: "Create or overwrite a .env file inside the repository root",
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
                    const fileName = ".env";

                    await sandbox.files.write(`repo/${fileName}`, envContent);

                    return {
                        status: "env_created",
                        file: fileName,
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
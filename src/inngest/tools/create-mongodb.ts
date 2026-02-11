import { z } from "zod";
import { createTool } from "@inngest/agent-kit";
import { randomUUID } from "crypto";

import { getSandbox } from "@/inngest/utils";

interface CreateMongoDbToolOptions {
    sandboxId: string;
}

const paramsSchema = z.object({
    envVarName: z
        .string()
        .min(1)
        .regex(/^[A-Z_][A-Z0-9_]*$/, "Invalid env variable name"),
});

export const createMongoDbTool = ({
                                      sandboxId,
                                  }: CreateMongoDbToolOptions) => {
    return createTool({
        name: "createMongoDb",
        description:
            "Provision a temporary MongoDB database and inject its URI into the sandbox .env file using a specified environment variable name",
        parameters: paramsSchema,
        handler: async (params, { step: toolStep }) => {
            const parsed = paramsSchema.safeParse(params);
            if (!parsed.success) {
                return `Error: ${parsed.error.issues[0].message}`;
            }

            const { envVarName } = parsed.data;

            try {
                return (
                    await toolStep?.run("createMongoDb", async () => {
                        // Generate unique database name
                        const dbName = `test_${randomUUID().replace(/-/g, "_")}`;

                        // Get MongoDB cluster URI template from CodeSentinel environment
                        const clusterUri = process.env.MONGO_URI;
                        if (!clusterUri) {
                            return "Error: MONGO_URI not configured in CodeSentinel environment";
                        }

                        if (!clusterUri.includes("{db_name}")) {
                            return "Error: MONGO_URI must contain {db_name} placeholder";
                        }

                        // Build database-specific URI
                        const mongoUri = clusterUri.replace("{db_name}", dbName);

                        const sandbox = await getSandbox(sandboxId);
                        const envFilePath = "repo/.env";

                        let existingEnvContent = "";
                        let envExists = false;

                        try {
                            existingEnvContent = await sandbox.files.read(envFilePath);
                            envExists = true;
                        } catch {
                            envExists = false;
                        }

                        let newEnvContent: string;

                        if (envExists && existingEnvContent) {
                            const lines = existingEnvContent.split("\n");
                            let updated = false;

                            const updatedLines = lines.map((line) => {
                                if (line.trim().startsWith(`${envVarName}=`)) {
                                    updated = true;
                                    return `${envVarName}=${mongoUri}`;
                                }
                                return line;
                            });

                            if (!updated) {
                                updatedLines.push(`${envVarName}=${mongoUri}`);
                            }

                            newEnvContent = updatedLines.join("\n");
                        } else {
                            newEnvContent = `${envVarName}=${mongoUri}`;
                        }

                        await sandbox.files.write(envFilePath, newEnvContent);

                        return {
                            status: "db_created",
                            db_name: dbName,
                            env_var: envVarName,
                            env_file: ".env",
                        };
                    })
                );
            } catch (error) {
                return `Failed to create MongoDB configuration: ${
                    error instanceof Error ? error.message : String(error)
                }`;
            }
        },
    });
};
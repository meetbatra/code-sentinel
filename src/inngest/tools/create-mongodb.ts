import { z } from "zod";
import { createTool } from "@inngest/agent-kit";

import { getSandbox } from "@/inngest/utils";
import { mergeEnvEntries } from "@/inngest/lib/env-file";

interface CreateMongoDbToolOptions {
    sandboxId: string;
}

const paramsSchema = z.object({
    envVarName: z
        .string()
        .min(1)
        .regex(/^[A-Z_][A-Z0-9_]*$/, "Invalid env variable name"),
    path: z.string().nullable().describe("Relative path from repo root to the .env file. Pass null to default to repo root."),
});

export const createMongoDbTool = ({
      sandboxId
}: CreateMongoDbToolOptions) => {
    return createTool({
        name: "createMongoDb",
        description:
            "Provision a temporary MongoDB database and merge its URI into the sandbox .env file at the specified path (default: repo root) using a specified environment variable name",
        parameters: paramsSchema,
        handler: async (params, { step: toolStep }) => {
            const parsed = paramsSchema.safeParse(params);
            if (!parsed.success) {
                return `Error: ${parsed.error.issues[0].message}`;
            }

            const { envVarName } = parsed.data;

            try {
                const result = await toolStep?.run("createMongoDb", async () => {
                    // MongoDB database name max length is 38 bytes
                    // Use timestamp + short random string instead of UUID
                    const timestamp = Date.now().toString(36); // Base36 timestamp
                    const random = Math.random().toString(36).substring(2, 8); // 6 char random
                    const dbName = `test_${timestamp}_${random}`; // ~20 chars

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
                    const envFilePath = `repo/${parsed.data.path || ".env"}`;

                    let existingEnvContent = "";
                    try {
                        existingEnvContent = await sandbox.files.read(envFilePath);
                    } catch {
                        existingEnvContent = "";
                    }

                    const mergeResult = mergeEnvEntries(existingEnvContent, [
                        { key: envVarName, value: mongoUri },
                    ]);
                    await sandbox.files.write(envFilePath, mergeResult.content);

                    return {
                        status: "db_created",
                        db_name: dbName,
                        env_var: envVarName,
                        env_file: parsed.data.path || ".env",
                        added_keys: mergeResult.addedKeys,
                        updated_keys: mergeResult.updatedKeys,
                    };
                });

                if (result && typeof result === 'object' && 'db_name' in result) {
                    const dbName = typeof (result as { db_name?: unknown }).db_name === "string"
                        ? (result as { db_name: string }).db_name
                        : "unknown";
                    const envVar = typeof (result as { env_var?: unknown }).env_var === "string"
                        ? (result as { env_var: string }).env_var
                        : envVarName;
                    const envFile = typeof (result as { env_file?: unknown }).env_file === "string"
                        ? (result as { env_file: string }).env_file
                        : parsed.data.path || ".env";
                    const addedKeys = Array.isArray((result as { added_keys?: unknown }).added_keys)
                        ? (result as { added_keys: string[] }).added_keys
                        : [];
                    const updatedKeys = Array.isArray((result as { updated_keys?: unknown }).updated_keys)
                        ? (result as { updated_keys: string[] }).updated_keys
                        : [];
                    return `Created MongoDB database "${dbName}" and merged ${envVar} into ${envFile}. Added: ${addedKeys.join(", ") || "none"}. Updated: ${updatedKeys.join(", ") || "none"}.`;
                } else if (typeof result === 'string' && result.startsWith('Error:')) {
                    return result;
                }

                return `Created MongoDB database and merged ${envVarName} into ${parsed.data.path || ".env"}`;
            } catch (error) {
                return `Failed to create MongoDB configuration: ${
                    error instanceof Error ? error.message : String(error)
                }`;
            }
        },
    });
};

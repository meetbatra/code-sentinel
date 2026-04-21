import { createTool } from "@inngest/agent-kit";
import { z } from "zod";
import type { PrismaClient } from "@/generated/prisma";
import { getSandbox } from "@/inngest/utils";
import { getSecret } from "@/inngest/tools/get-secret";

type CreateInjectUserEnvsToolOptions = {
  sandboxId: string;
  userId: string;
  db: PrismaClient;
};

const keyNameSchema = z
  .string()
  .trim()
  .min(1)
  .regex(
    /^[A-Z][A-Z0-9_]*$/,
    "Key name must start with a capital letter and use only A-Z, 0-9, and underscores."
  );

const paramsSchema = z.object({
  keyNames: z
    .array(keyNameSchema)
    .min(1)
    .describe("Vault key names to inject into the target .env file."),
  path: z
    .string()
    .nullable()
    .describe("Relative path from repo root to the .env file. Pass null to default to repo root."),
});

export const createInjectUserEnvsTool = ({
  sandboxId,
  userId,
  db,
}: CreateInjectUserEnvsToolOptions) => {
  return createTool({
    name: "injectUserEnvs",
    description:
      "Fetch selected user vault secrets server-side and inject them into a sandbox .env file without returning secret values.",
    parameters: paramsSchema,
    handler: async (params, { step: toolStep }) => {
      const parsed = paramsSchema.safeParse(params);
      if (!parsed.success) {
        return `Error: ${parsed.error.issues[0].message}`;
      }

      const uniqueKeyNames = Array.from(new Set(parsed.data.keyNames));

      try {
        const result = await toolStep?.run("inject-user-envs", async () => {
          const sandbox = await getSandbox(sandboxId);
          const envFilePath = `repo/${parsed.data.path || ".env"}`;

          const missingKeys: string[] = [];
          const resolvedSecrets: Array<{ key: string; value: string }> = [];

          for (const keyName of uniqueKeyNames) {
            try {
              const value = await getSecret({ userId, keyName, db });
              resolvedSecrets.push({ key: keyName, value });
            } catch (error) {
              if (error instanceof Error && error.message.includes("not found")) {
                missingKeys.push(keyName);
                continue;
              }
              throw error;
            }
          }

          if (missingKeys.length > 0) {
            return {
              status: "missing_keys",
              missingKeys,
            };
          }

          let existingEnvContent = "";
          try {
            existingEnvContent = await sandbox.files.read(envFilePath);
          } catch {
            existingEnvContent = "";
          }

          const lines = existingEnvContent ? existingEnvContent.split("\n") : [];

          for (const { key, value } of resolvedSecrets) {
            const envLine = `${key}=${value}`;
            let updated = false;

            for (let i = 0; i < lines.length; i++) {
              if (lines[i].trim().startsWith(`${key}=`)) {
                lines[i] = envLine;
                updated = true;
                break;
              }
            }

            if (!updated) {
              lines.push(envLine);
            }
          }

          await sandbox.files.write(envFilePath, lines.join("\n"));

          return {
            status: "injected",
            path: parsed.data.path || ".env",
            injectedKeys: resolvedSecrets.map((item) => item.key),
          };
        });

        if (result && typeof result === "object" && "status" in result) {
          if (result.status === "missing_keys") {
            const missing = Array.isArray((result as { missingKeys?: unknown }).missingKeys)
              ? (result as { missingKeys: string[] }).missingKeys
              : [];
            return `Error: Vault keys not found: ${missing.join(", ")}`;
          }

          if (result.status === "injected") {
            const injectedKeys = Array.isArray((result as { injectedKeys?: unknown }).injectedKeys)
              ? (result as { injectedKeys: string[] }).injectedKeys
              : [];
            const targetPath = typeof (result as { path?: unknown }).path === "string"
              ? (result as { path: string }).path
              : ".env";
            return `Injected ${injectedKeys.length} vault key(s) into ${targetPath}: ${injectedKeys.join(", ")}`;
          }
        }

        return `Injected ${uniqueKeyNames.length} vault key(s) into ${parsed.data.path || ".env"}`;
      } catch (error) {
        return `Failed to inject vault keys: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    },
  });
};

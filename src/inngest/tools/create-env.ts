import { z } from "zod";
import { createTool } from "@inngest/agent-kit";
import { getSandbox } from "@/inngest/utils";
import path from "path";

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
        description: "Create or overwrite a .env file at specified path (default: repo root). Enforces complete env-var coverage for the target scope.",
        parameters: paramsSchema,
        handler: async (params, { step: toolStep }) => {
            const parsed = paramsSchema.safeParse(params);
            if (!parsed.success) {
                return `Error: ${parsed.error.issues[0].message}`;
            }

            const { envVars } = parsed.data;
            const providedKeys = new Set(envVars.map((v) => v.key));

            const envContent = envVars
                .map(({ key, value }) => `${key}=${value}`)
                .join("\n");

            try {
                const result = await toolStep?.run("createEnv", async () => {
                    const sandbox = await getSandbox(sandboxId);
                    const filePath = parsed.data.path || ".env";
                    const scopeDir = path.posix.dirname(filePath) === "." ? "." : path.posix.dirname(filePath);

                    // Discover env references before writing .env to prevent partial/incomplete env files.
                    const targetPath = scopeDir === "." ? "." : scopeDir;
                    const discoveryCmd = `
cd repo &&
rg -n -o \
  -g '!**/node_modules/**' \
  -g '!**/.next/**' \
  -g '!**/dist/**' \
  -g '!**/build/**' \
  -g '!**/coverage/**' \
  -g '!**/.turbo/**' \
  -g '!**/.git/**' \
  -e "process\\.env\\.[A-Z0-9_]+" \
  -e "process\\.env\\[['\\\"][A-Z0-9_]+['\\\"]\\]" \
  -e "import\\.meta\\.env\\.[A-Z0-9_]+" \
  ${targetPath}
                    `.trim();

                    let discoveryStdout = "";
                    try {
                        const discoveryResult = await sandbox.commands.run(discoveryCmd);
                        discoveryStdout = discoveryResult.stdout || "";
                    } catch {
                        // Fallback when ripgrep is unavailable in sandbox.
                        const fallbackCmd = `
cd repo &&
grep -RnoE \
  --exclude-dir=node_modules \
  --exclude-dir=.next \
  --exclude-dir=dist \
  --exclude-dir=build \
  --exclude-dir=coverage \
  --exclude-dir=.turbo \
  --exclude-dir=.git \
  "process\\.env\\.[A-Z0-9_]+|process\\.env\\[['\\\"][A-Z0-9_]+['\\\"]\\]|import\\.meta\\.env\\.[A-Z0-9_]+" \
  ${targetPath} || true
                        `.trim();
                        const fallbackResult = await sandbox.commands.run(fallbackCmd);
                        discoveryStdout = fallbackResult.stdout || "";
                    }
                    const discovered = new Set<string>();

                    if (discoveryStdout) {
                        const pattern =
                            /process\.env\.([A-Z0-9_]+)|process\.env\[['"]([A-Z0-9_]+)['"]\]|import\.meta\.env\.([A-Z0-9_]+)/g;
                        let match: RegExpExecArray | null;
                        while ((match = pattern.exec(discoveryStdout)) !== null) {
                            const key = match[1] || match[2] || match[3];
                            if (key) discovered.add(key);
                        }
                    }

                    const dbVarPattern = /(MONGO|MONGODB|DATABASE|POSTGRES|MYSQL|SQLITE|DB_URL|DATABASE_URL|REDIS)/i;
                    const missing = Array.from(discovered).filter(
                        (key) => !providedKeys.has(key) && !dbVarPattern.test(key)
                    );

                    if (missing.length > 0) {
                        return {
                            status: "env_incomplete",
                            file: filePath,
                            missing,
                            discovered: Array.from(discovered),
                        };
                    }

                    await sandbox.files.write(`repo/${filePath}`, envContent);

                    return {
                        status: "env_created",
                        file: filePath,
                        vars_written: envVars.map(v => v.key),
                    };
                });

                if (result && typeof result === 'object' && 'status' in result && result.status === "env_incomplete") {
                    const missing = Array.isArray((result as { missing?: unknown }).missing)
                        ? (result as { missing: string[] }).missing
                        : [];
                    return `Error: createEnv blocked because required env vars are missing for this scope: ${missing.join(", ")}`;
                }

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

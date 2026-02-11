import { z } from "zod";
import { createTool } from "@inngest/agent-kit";
import { getSandbox } from "@/inngest/utils";

interface GetServerUrlToolOptions {
    sandboxId: string;
}

const paramsSchema = z.object({
    port: z
        .number()
        .int()
        .min(1)
        .max(65535),
});

export const createGetServerUrlTool = ({
    sandboxId,
}: GetServerUrlToolOptions) => {
    return createTool({
        name: "getServerUrl",
        description: "Get the public sandbox URL for a running server port",
        parameters: z.object({
            port: z
                .number()
                .int()
                .min(1)
                .max(65535)
        }),
        handler: async (params, { step }) => {
            const parsed = paramsSchema.safeParse(params);

            if (!parsed.success) {
                return `Error: ${parsed.error.issues[0].message}`;
            }

            const { port } = parsed.data;

            try {
                return (
                    await step?.run("getServerUrl", async () => {
                        const sandbox = await getSandbox(sandboxId);

                        // E2B exposes services via getHost(port)
                        const host = sandbox.getHost(port);

                        return {
                            status: "ok",
                            port,
                            url: `https://${host}`,
                        };
                    })
                );
            } catch (error) {
                return {
                    status: "error",
                    message:
                        error instanceof Error
                            ? error.message
                            : "Failed to resolve sandbox URL",
                };
            }
        },
    });
};
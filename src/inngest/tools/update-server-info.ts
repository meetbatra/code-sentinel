import { z } from "zod";
import { createTool } from "@inngest/agent-kit";

export const createUpdateServerInfoTool = () => {
    return createTool({
        name: "updateServerInfo",
        description: "Update server information in state. All fields are optional - only provide what you know.",
        parameters: z.object({
            port: z.number().describe("Server port number").default(0),
            sandboxUrl: z.string().describe("Public sandbox URL").default(""),
            startCommand: z.string().describe("Command used to start server").default(""),
            isRunning: z.boolean().describe("Whether server is running").default(false),
        }),
        handler: async (params, { step: toolStep, network }) => {
            if (!network) {
                return "Error: Network not available";
            }

            try {
                const updates = await toolStep?.run("update-server-info", async () => {
                    const updatesList: string[] = [];

                    if (params.port && params.port > 0) updatesList.push("port");
                    if (params.sandboxUrl) updatesList.push("sandboxUrl");
                    if (params.startCommand) updatesList.push("startCommand");
                    if (params.isRunning !== undefined) updatesList.push("isRunning");

                    return {
                        updatesList,
                        data: {
                            port: params.port > 0 ? params.port : undefined,
                            sandboxUrl: params.sandboxUrl || undefined,
                            startCommand: params.startCommand || undefined,
                            isRunning: params.isRunning,
                        }
                    };
                });

                if (network && updates) {
                    const serverInfo = network.state.data.serverInfo || {};

                    if (updates.data.port) serverInfo.port = updates.data.port;
                    if (updates.data.sandboxUrl) serverInfo.sandboxUrl = updates.data.sandboxUrl;
                    if (updates.data.startCommand) serverInfo.startCommand = updates.data.startCommand;
                    if (updates.data.isRunning !== undefined) serverInfo.isRunning = updates.data.isRunning;

                    network.state.data.serverInfo = serverInfo;
                }

                return updates && updates.updatesList.length > 0
                    ? `Updated server info: ${updates.updatesList.join(", ")}`
                    : "No updates provided";
            } catch (error) {
                return `Error updating server info: ${error instanceof Error ? error.message : "Unknown error"}`;
            }
        },
    });
};



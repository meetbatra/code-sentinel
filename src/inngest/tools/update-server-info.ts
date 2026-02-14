import { z } from "zod";
import { createTool } from "@inngest/agent-kit";
import { prisma } from "@/lib/prisma";

interface UpdateServerInfoOptions {
    jobId: string;
}

export const createUpdateServerInfoTool = ({ jobId }: UpdateServerInfoOptions) => {
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
                return await toolStep?.run("update-server-info", async () => {
                    const updatesList: string[] = [];

                    if (params.port && params.port > 0) updatesList.push("port");
                    if (params.sandboxUrl) updatesList.push("sandboxUrl");
                    if (params.startCommand) updatesList.push("startCommand");
                    if (params.isRunning !== undefined) updatesList.push("isRunning");

                    const data = {
                        port: params.port > 0 ? params.port : undefined,
                        sandboxUrl: params.sandboxUrl || undefined,
                        startCommand: params.startCommand || undefined,
                        isRunning: params.isRunning,
                    };

                    // Update agent state
                    if (network) {
                        const serverInfo = network.state.data.serverInfo || {};

                        if (data.port) serverInfo.port = data.port;
                        if (data.sandboxUrl) serverInfo.sandboxUrl = data.sandboxUrl;
                        if (data.startCommand) serverInfo.startCommand = data.startCommand;
                        if (data.isRunning !== undefined) serverInfo.isRunning = data.isRunning;

                        network.state.data.serverInfo = serverInfo;
                    }

                    // Get current job serverInfo from database
                    const currentJob = await prisma.job.findUnique({
                        where: { id: jobId },
                        select: { serverInfo: true },
                    });

                    const currentServerInfo = (typeof currentJob?.serverInfo === 'object' && currentJob.serverInfo !== null)
                        ? currentJob.serverInfo as Record<string, unknown>
                        : {};

                    // Merge with new data
                    const updatedServerInfo = {
                        ...currentServerInfo,
                        ...(data.port && { port: data.port }),
                        ...(data.sandboxUrl && { sandboxUrl: data.sandboxUrl }),
                        ...(data.startCommand && { startCommand: data.startCommand }),
                        ...(data.isRunning !== undefined && { isRunning: data.isRunning }),
                    };

                    // Save to database
                    await prisma.job.update({
                        where: { id: jobId },
                        data: { serverInfo: updatedServerInfo },
                    });

                    return updatesList.length > 0
                        ? `Updated server info: ${updatesList.join(", ")}`
                        : "No updates provided";
                }) || "Server info updated";
            } catch (error) {
                return `Error updating server info: ${error instanceof Error ? error.message : "Unknown error"}`;
            }
        },
    });
};

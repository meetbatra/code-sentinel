import { z } from "zod";
import { createTool } from "@inngest/agent-kit";
import { prisma } from "@/lib/prisma";

interface UpdateServerInfoOptions {
    jobId: string;
}

export const createUpdateServerInfoTool = ({ jobId }: UpdateServerInfoOptions) => {
    return createTool({
        name: "updateServerInfo",
        description: "Update server information in state. Supports generic single-server fields and split backend/frontend fields.",
        parameters: z.object({
            port: z.number().describe("Server port number").default(0),
            sandboxUrl: z.string().describe("Public sandbox URL").default(""),
            startCommand: z.string().describe("Command used to start server").default(""),
            isRunning: z.boolean().describe("Whether server is running").default(false),
            backendPort: z.number().describe("Backend server port number").default(0),
            backendUrl: z.string().describe("Backend public URL").default(""),
            backendStartCommand: z.string().describe("Backend start command").default(""),
            backendRunning: z.boolean().describe("Whether backend server is running").default(false),
            frontendPort: z.number().describe("Frontend server port number").default(0),
            frontendUrl: z.string().describe("Frontend public URL (if available)").default(""),
            frontendStartCommand: z.string().describe("Frontend start command").default(""),
            frontendRunning: z.boolean().describe("Whether frontend server is running").default(false),
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
                    if (params.backendPort && params.backendPort > 0) updatesList.push("backendPort");
                    if (params.backendUrl) updatesList.push("backendUrl");
                    if (params.backendStartCommand) updatesList.push("backendStartCommand");
                    if (params.backendRunning !== undefined) updatesList.push("backendRunning");
                    if (params.frontendPort && params.frontendPort > 0) updatesList.push("frontendPort");
                    if (params.frontendUrl) updatesList.push("frontendUrl");
                    if (params.frontendStartCommand) updatesList.push("frontendStartCommand");
                    if (params.frontendRunning !== undefined) updatesList.push("frontendRunning");

                    const data = {
                        port: params.port > 0 ? params.port : undefined,
                        sandboxUrl: params.sandboxUrl || undefined,
                        startCommand: params.startCommand || undefined,
                        isRunning: params.isRunning,
                        backendPort: params.backendPort > 0 ? params.backendPort : undefined,
                        backendUrl: params.backendUrl || undefined,
                        backendStartCommand: params.backendStartCommand || undefined,
                        backendRunning: params.backendRunning,
                        frontendPort: params.frontendPort > 0 ? params.frontendPort : undefined,
                        frontendUrl: params.frontendUrl || undefined,
                        frontendStartCommand: params.frontendStartCommand || undefined,
                        frontendRunning: params.frontendRunning,
                    };

                    // Update agent state
                    if (network) {
                        const serverInfo = network.state.data.serverInfo || {};

                        if (data.port) serverInfo.port = data.port;
                        if (data.sandboxUrl) serverInfo.sandboxUrl = data.sandboxUrl;
                        if (data.startCommand) serverInfo.startCommand = data.startCommand;
                        if (data.isRunning !== undefined) serverInfo.isRunning = data.isRunning;
                        if (data.backendPort) serverInfo.backendPort = data.backendPort;
                        if (data.backendUrl) serverInfo.backendUrl = data.backendUrl;
                        if (data.backendStartCommand) serverInfo.backendStartCommand = data.backendStartCommand;
                        if (data.backendRunning !== undefined) serverInfo.backendRunning = data.backendRunning;
                        if (data.frontendPort) serverInfo.frontendPort = data.frontendPort;
                        if (data.frontendUrl) serverInfo.frontendUrl = data.frontendUrl;
                        if (data.frontendStartCommand) serverInfo.frontendStartCommand = data.frontendStartCommand;
                        if (data.frontendRunning !== undefined) serverInfo.frontendRunning = data.frontendRunning;

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
                        ...(data.backendPort && { backendPort: data.backendPort }),
                        ...(data.backendUrl && { backendUrl: data.backendUrl }),
                        ...(data.backendStartCommand && { backendStartCommand: data.backendStartCommand }),
                        ...(data.backendRunning !== undefined && { backendRunning: data.backendRunning }),
                        ...(data.frontendPort && { frontendPort: data.frontendPort }),
                        ...(data.frontendUrl && { frontendUrl: data.frontendUrl }),
                        ...(data.frontendStartCommand && { frontendStartCommand: data.frontendStartCommand }),
                        ...(data.frontendRunning !== undefined && { frontendRunning: data.frontendRunning }),
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

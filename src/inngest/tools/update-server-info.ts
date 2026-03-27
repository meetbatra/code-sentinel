import { z } from "zod";
import { createTool } from "@inngest/agent-kit";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";

interface UpdateServerInfoOptions {
    jobId: string;
}

export const createUpdateServerInfoTool = ({ jobId }: UpdateServerInfoOptions) => {
    return createTool({
        name: "updateServerInfo",
        description: "Update server information in state. Supports generic single-server fields and split backend/frontend fields.",
        parameters: z.object({
            port: z.number().optional().describe("Server port number"),
            sandboxUrl: z.string().optional().describe("Public sandbox URL"),
            startCommand: z.string().optional().describe("Command used to start server"),
            isRunning: z.boolean().optional().describe("Whether server is running"),
            backendPort: z.number().optional().describe("Backend server port number"),
            backendUrl: z.string().optional().describe("Backend public URL"),
            backendStartCommand: z.string().optional().describe("Backend start command"),
            backendRunning: z.boolean().optional().describe("Whether backend server is running"),
            frontendPort: z.number().optional().describe("Frontend server port number"),
            frontendUrl: z.string().optional().describe("Frontend public URL (if available)"),
            frontendStartCommand: z.string().optional().describe("Frontend start command"),
            frontendRunning: z.boolean().optional().describe("Whether frontend server is running"),
        }),
        handler: async (params, { step: toolStep, network }) => {
            if (!network) {
                return "Error: Network not available";
            }

            try {
                return await toolStep?.run("update-server-info", async () => {
                    const raw = params as Record<string, unknown>;
                    const has = (key: string) => Object.prototype.hasOwnProperty.call(raw, key);
                    const updatesList: string[] = [];

                    if (has("port")) updatesList.push("port");
                    if (has("sandboxUrl")) updatesList.push("sandboxUrl");
                    if (has("startCommand")) updatesList.push("startCommand");
                    if (has("isRunning")) updatesList.push("isRunning");
                    if (has("backendPort")) updatesList.push("backendPort");
                    if (has("backendUrl")) updatesList.push("backendUrl");
                    if (has("backendStartCommand")) updatesList.push("backendStartCommand");
                    if (has("backendRunning")) updatesList.push("backendRunning");
                    if (has("frontendPort")) updatesList.push("frontendPort");
                    if (has("frontendUrl")) updatesList.push("frontendUrl");
                    if (has("frontendStartCommand")) updatesList.push("frontendStartCommand");
                    if (has("frontendRunning")) updatesList.push("frontendRunning");

                    const data = {
                        port: params.port,
                        sandboxUrl: params.sandboxUrl,
                        startCommand: params.startCommand,
                        isRunning: params.isRunning,
                        backendPort: params.backendPort,
                        backendUrl: params.backendUrl,
                        backendStartCommand: params.backendStartCommand,
                        backendRunning: params.backendRunning,
                        frontendPort: params.frontendPort,
                        frontendUrl: params.frontendUrl,
                        frontendStartCommand: params.frontendStartCommand,
                        frontendRunning: params.frontendRunning,
                    };

                    // Update agent state
                    if (network) {
                        const serverInfo = network.state.data.serverInfo || {};

                        if (has("port")) serverInfo.port = data.port;
                        if (has("sandboxUrl")) serverInfo.sandboxUrl = data.sandboxUrl;
                        if (has("startCommand")) serverInfo.startCommand = data.startCommand;
                        if (has("isRunning")) serverInfo.isRunning = data.isRunning;
                        if (has("backendPort")) serverInfo.backendPort = data.backendPort;
                        if (has("backendUrl")) serverInfo.backendUrl = data.backendUrl;
                        if (has("backendStartCommand")) serverInfo.backendStartCommand = data.backendStartCommand;
                        if (has("backendRunning")) serverInfo.backendRunning = data.backendRunning;
                        if (has("frontendPort")) serverInfo.frontendPort = data.frontendPort;
                        if (has("frontendUrl")) serverInfo.frontendUrl = data.frontendUrl;
                        if (has("frontendStartCommand")) serverInfo.frontendStartCommand = data.frontendStartCommand;
                        if (has("frontendRunning")) serverInfo.frontendRunning = data.frontendRunning;

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
                        ...(has("port") && { port: data.port }),
                        ...(has("sandboxUrl") && { sandboxUrl: data.sandboxUrl }),
                        ...(has("startCommand") && { startCommand: data.startCommand }),
                        ...(has("isRunning") && { isRunning: data.isRunning }),
                        ...(has("backendPort") && { backendPort: data.backendPort }),
                        ...(has("backendUrl") && { backendUrl: data.backendUrl }),
                        ...(has("backendStartCommand") && { backendStartCommand: data.backendStartCommand }),
                        ...(has("backendRunning") && { backendRunning: data.backendRunning }),
                        ...(has("frontendPort") && { frontendPort: data.frontendPort }),
                        ...(has("frontendUrl") && { frontendUrl: data.frontendUrl }),
                        ...(has("frontendStartCommand") && { frontendStartCommand: data.frontendStartCommand }),
                        ...(has("frontendRunning") && { frontendRunning: data.frontendRunning }),
                    };

                    // Save to database
                    await prisma.job.update({
                        where: { id: jobId },
                        data: { serverInfo: updatedServerInfo as Prisma.InputJsonValue },
                    });

                    await prisma.jobRunEvent.create({
                        data: {
                            jobId,
                            eventType: "SERVER",
                            payload: {
                                updates: updatesList,
                            },
                        },
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

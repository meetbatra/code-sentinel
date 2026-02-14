import { z } from "zod";
import { createTool } from "@inngest/agent-kit";
import { prisma } from "@/lib/prisma";

interface UpdateDiscoveryOptions {
    jobId: string;
}

export const createUpdateDiscoveryTool = ({ jobId }: UpdateDiscoveryOptions) => {
    return createTool({
        name: "updateDiscovery",
        description: "Update discovery information in state as you learn about the codebase. All fields are optional - only provide what you've discovered.",
        parameters: z.object({
            entryPoint: z.string().describe("Main server file (e.g., 'server.js')").default(""),
            framework: z.string().describe("Detected framework (e.g., 'express', 'fastify')").default(""),
            moduleType: z.string().describe("Module system type: 'esm' or 'commonjs'").default(""),
            endpoints: z.array(
                z.object({
                    method: z.string().describe("HTTP method"),
                    path: z.string().describe("Route path"),
                    file: z.string().describe("File containing route"),
                })
            ).describe("Array of discovered endpoints").default([]),
            envVarsNeeded: z.array(z.string()).describe("Required environment variables").default([]),
            databaseUsed: z.boolean().describe("Whether database is used").default(false),
        }),
        handler: async (params, { step: toolStep, network }) => {
            if (!network) {
                return "Error: Network not available";
            }

            try {
                return await toolStep?.run("update-discovery", async () => {
                    const updatesList: string[] = [];

                    if (params.entryPoint) updatesList.push("entryPoint");
                    if (params.framework) updatesList.push("framework");
                    if (params.moduleType && params.moduleType !== "") updatesList.push("moduleType");
                    if (params.endpoints && params.endpoints.length > 0) updatesList.push("endpoints");
                    if (params.envVarsNeeded && params.envVarsNeeded.length > 0) updatesList.push("envVarsNeeded");
                    if (params.databaseUsed !== undefined) updatesList.push("databaseUsed");

                    const data = {
                        entryPoint: params.entryPoint || undefined,
                        framework: params.framework || undefined,
                        moduleType: params.moduleType || undefined,
                        endpoints: params.endpoints.length > 0 ? params.endpoints : undefined,
                        envVarsNeeded: params.envVarsNeeded.length > 0 ? params.envVarsNeeded : undefined,
                        databaseUsed: params.databaseUsed,
                    };

                    // Update agent state
                    if (network) {
                        const discoveryInfo = network.state.data.discoveryInfo || {};

                        if (data.entryPoint) discoveryInfo.entryPoint = data.entryPoint;
                        if (data.framework) discoveryInfo.framework = data.framework;
                        if (data.moduleType) discoveryInfo.moduleType = data.moduleType;
                        if (data.endpoints) discoveryInfo.endpoints = data.endpoints;
                        if (data.envVarsNeeded) discoveryInfo.envVarsNeeded = data.envVarsNeeded;
                        if (data.databaseUsed !== undefined) discoveryInfo.databaseUsed = data.databaseUsed;

                        network.state.data.discoveryInfo = discoveryInfo;
                    }

                    // Get current job discoveryInfo from database
                    const currentJob = await prisma.job.findUnique({
                        where: { id: jobId },
                        select: { discoveryInfo: true },
                    });

                    const currentDiscoveryInfo = (typeof currentJob?.discoveryInfo === 'object' && currentJob.discoveryInfo !== null)
                        ? currentJob.discoveryInfo as Record<string, unknown>
                        : {};

                    // Merge with new data
                    const updatedDiscoveryInfo = {
                        ...currentDiscoveryInfo,
                        ...(data.entryPoint && { entryPoint: data.entryPoint }),
                        ...(data.framework && { framework: data.framework }),
                        ...(data.moduleType && { moduleType: data.moduleType }),
                        ...(data.endpoints && { endpoints: data.endpoints }),
                        ...(data.envVarsNeeded && { envVarsNeeded: data.envVarsNeeded }),
                        ...(data.databaseUsed !== undefined && { databaseUsed: data.databaseUsed }),
                    };

                    // Save to database
                    await prisma.job.update({
                        where: { id: jobId },
                        data: { discoveryInfo: updatedDiscoveryInfo },
                    });

                    return updatesList.length > 0
                        ? `Updated discovery info: ${updatesList.join(", ")}`
                        : "No updates provided";
                }) || "Discovery info updated";
            } catch (error) {
                return `Error updating discovery: ${error instanceof Error ? error.message : "Unknown error"}`;
            }
        },
    });
};

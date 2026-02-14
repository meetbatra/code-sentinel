import { z } from "zod";
import { createTool } from "@inngest/agent-kit";

export const createUpdateDiscoveryTool = () => {
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
                const updates = await toolStep?.run("update-discovery", async () => {
                    const updatesList: string[] = [];

                    if (params.entryPoint) updatesList.push("entryPoint");
                    if (params.framework) updatesList.push("framework");
                    if (params.moduleType && params.moduleType !== "") updatesList.push("moduleType");
                    if (params.endpoints && params.endpoints.length > 0) updatesList.push("endpoints");
                    if (params.envVarsNeeded && params.envVarsNeeded.length > 0) updatesList.push("envVarsNeeded");
                    if (params.databaseUsed !== undefined) updatesList.push("databaseUsed");

                    return {
                        updatesList,
                        data: {
                            entryPoint: params.entryPoint || undefined,
                            framework: params.framework || undefined,
                            moduleType: params.moduleType || undefined,
                            endpoints: params.endpoints.length > 0 ? params.endpoints : undefined,
                            envVarsNeeded: params.envVarsNeeded.length > 0 ? params.envVarsNeeded : undefined,
                            databaseUsed: params.databaseUsed !== false ? params.databaseUsed : undefined,
                        }
                    };
                });

                if (network && updates) {
                    const discoveryInfo = network.state.data.discoveryInfo || {};

                    if (updates.data.entryPoint) discoveryInfo.entryPoint = updates.data.entryPoint;
                    if (updates.data.framework) discoveryInfo.framework = updates.data.framework;
                    if (updates.data.moduleType) discoveryInfo.moduleType = updates.data.moduleType;
                    if (updates.data.endpoints) discoveryInfo.endpoints = updates.data.endpoints;
                    if (updates.data.envVarsNeeded) discoveryInfo.envVarsNeeded = updates.data.envVarsNeeded;
                    if (updates.data.databaseUsed !== undefined) discoveryInfo.databaseUsed = updates.data.databaseUsed;

                    network.state.data.discoveryInfo = discoveryInfo;
                }

                return updates && updates.updatesList.length > 0
                    ? `Updated discovery info: ${updates.updatesList.join(", ")}`
                    : "No updates provided";
            } catch (error) {
                return `Error updating discovery: ${error instanceof Error ? error.message : "Unknown error"}`;
            }
        },
    });
};



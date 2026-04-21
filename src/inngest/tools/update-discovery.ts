import { z } from "zod";
import { createTool } from "@inngest/agent-kit";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma";

interface UpdateDiscoveryOptions {
    jobId: string;
}

function dedupeEndpoints(
    existing: Array<{ method: string; path: string; file: string }>,
    incoming: Array<{ method: string; path: string; file: string }>
) {
    const map = new Map<string, { method: string; path: string; file: string }>();
    for (const endpoint of [...existing, ...incoming]) {
        const key = `${endpoint.method.toUpperCase()} ${endpoint.path} ${endpoint.file}`;
        map.set(key, endpoint);
    }
    return Array.from(map.values());
}

export const createUpdateDiscoveryTool = ({ jobId }: UpdateDiscoveryOptions) => {
    return createTool({
        name: "updateDiscovery",
        description: "Update discovery information in state as you learn about the codebase. Supports backend-only and full-stack metadata.",
        parameters: z.object({
            entryPoint: z.string().nullable().describe("Main server file (e.g., 'server.js')"),
            framework: z.string().nullable().describe("Detected framework (e.g., 'express', 'fastify')"),
            moduleType: z.string().nullable().describe("Module system type: 'esm' or 'commonjs'"),
            backendEntryPoint: z.string().nullable().describe("Backend/server entry point for full-stack apps"),
            frontendEntryPoint: z.string().nullable().describe("Frontend entry point for full-stack apps"),
            backendFramework: z.string().nullable().describe("Backend framework (e.g., express, fastify)"),
            frontendFramework: z.string().nullable().describe("Frontend framework (e.g., react, next, ejs views)"),
            endpoints: z.array(
                z.object({
                    method: z.string().describe("HTTP method"),
                    path: z.string().describe("Route path"),
                    file: z.string().describe("File containing route"),
                })
            ).nullable().describe("Array of discovered endpoints"),
            envVarsNeeded: z.array(z.string()).nullable().describe("Required environment variables"),
            databaseUsed: z.boolean().nullable().describe("Whether database is used"),
        }),
        handler: async (params, { step: toolStep, network }) => {
            if (!network) {
                return "Error: Network not available";
            }

            try {
                return await toolStep?.run("update-discovery", async () => {
                    const updatesList: string[] = [];

                    const has = (key: keyof typeof params) => params[key] !== null && params[key] !== undefined;

                    if (has("entryPoint")) updatesList.push("entryPoint");
                    if (has("framework")) updatesList.push("framework");
                    if (has("moduleType")) updatesList.push("moduleType");
                    if (has("backendEntryPoint")) updatesList.push("backendEntryPoint");
                    if (has("frontendEntryPoint")) updatesList.push("frontendEntryPoint");
                    if (has("backendFramework")) updatesList.push("backendFramework");
                    if (has("frontendFramework")) updatesList.push("frontendFramework");
                    if (has("endpoints")) updatesList.push("endpoints");
                    if (has("envVarsNeeded")) updatesList.push("envVarsNeeded");
                    if (has("databaseUsed")) updatesList.push("databaseUsed");

                    const data = {
                        entryPoint: params.entryPoint,
                        framework: params.framework,
                        moduleType: params.moduleType,
                        backendEntryPoint: params.backendEntryPoint,
                        frontendEntryPoint: params.frontendEntryPoint,
                        backendFramework: params.backendFramework,
                        frontendFramework: params.frontendFramework,
                        endpoints: params.endpoints,
                        envVarsNeeded: params.envVarsNeeded,
                        databaseUsed: params.databaseUsed,
                    };

                    // Update agent state
                    if (network) {
                        const discoveryInfo = network.state.data.discoveryInfo || {};

                        if (has("entryPoint")) discoveryInfo.entryPoint = data.entryPoint;
                        if (has("framework")) discoveryInfo.framework = data.framework;
                        if (has("moduleType")) discoveryInfo.moduleType = data.moduleType;
                        if (has("backendEntryPoint")) discoveryInfo.backendEntryPoint = data.backendEntryPoint;
                        if (has("frontendEntryPoint")) discoveryInfo.frontendEntryPoint = data.frontendEntryPoint;
                        if (has("backendFramework")) discoveryInfo.backendFramework = data.backendFramework;
                        if (has("frontendFramework")) discoveryInfo.frontendFramework = data.frontendFramework;
                        if (has("endpoints") && data.endpoints) {
                            const existing = Array.isArray(discoveryInfo.endpoints)
                                ? discoveryInfo.endpoints as Array<{ method: string; path: string; file: string }>
                                : [];
                            const incoming = Array.isArray(data.endpoints) ? data.endpoints : [];
                            discoveryInfo.endpoints = dedupeEndpoints(existing, incoming);
                        }
                        if (has("envVarsNeeded")) discoveryInfo.envVarsNeeded = data.envVarsNeeded;
                        if (has("databaseUsed")) discoveryInfo.databaseUsed = data.databaseUsed;

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
                    const updatedDiscoveryInfo: Record<string, unknown> = {
                        ...currentDiscoveryInfo,
                        ...(has("entryPoint") && { entryPoint: data.entryPoint }),
                        ...(has("framework") && { framework: data.framework }),
                        ...(has("moduleType") && { moduleType: data.moduleType }),
                        ...(has("backendEntryPoint") && { backendEntryPoint: data.backendEntryPoint }),
                        ...(has("frontendEntryPoint") && { frontendEntryPoint: data.frontendEntryPoint }),
                        ...(has("backendFramework") && { backendFramework: data.backendFramework }),
                        ...(has("frontendFramework") && { frontendFramework: data.frontendFramework }),
                        ...(has("envVarsNeeded") && { envVarsNeeded: data.envVarsNeeded }),
                        ...(has("databaseUsed") && { databaseUsed: data.databaseUsed }),
                    };
                    if (has("endpoints") && data.endpoints) {
                        const existing = Array.isArray(currentDiscoveryInfo.endpoints)
                            ? currentDiscoveryInfo.endpoints as Array<{ method: string; path: string; file: string }>
                            : [];
                        const incoming = Array.isArray(data.endpoints) ? data.endpoints : [];
                        updatedDiscoveryInfo.endpoints = dedupeEndpoints(existing, incoming);
                    }

                    // Save to database
                    await prisma.job.update({
                        where: { id: jobId },
                        data: { discoveryInfo: updatedDiscoveryInfo as Prisma.InputJsonValue },
                    });

                    await prisma.jobRunEvent.create({
                        data: {
                            jobId,
                            eventType: "DISCOVERY",
                            payload: {
                                updates: updatesList,
                            },
                        },
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

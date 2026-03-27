import { z } from "zod";
import { createTool } from "@inngest/agent-kit";
import { getSandbox } from "@/inngest/utils";



interface BrowserActionToolOptions {
    sandboxId: string;
}

export const createBrowserActionTool = ({ sandboxId }: BrowserActionToolOptions) => {
    return createTool({
        name: "browserAction",
        description: "Control the Chromium browser running inside the sandbox to test frontends",
        parameters: z.object({
            action: z.enum([
                "navigate",
                "click",
                "fill",
                "screenshot",
                "read-console",
                "wait-for-element",
                "get-text",
                "evaluate",
                "get-network-logs",
                "clear-network-logs"
            ]).describe("The browser action to perform"),
            args: z.object({
                url: z.string().nullable(),
                selector: z.string().nullable(),
                text: z.string().nullable(),
                path: z.string().nullable(),
                clear: z.boolean().nullable(),
                timeout: z.number().nullable(),
                timeoutMs: z.number().nullable(),
                expression: z.string().nullable(),
                filter: z.string().nullable(),
                statusCode: z.number().nullable()
            }).describe("Arguments specific to the action as a strict object. MUST populate unused fields with null."),
        }),
        handler: async (params, { step: toolStep }) => {
            const { action, args } = params;
            try {
                const result = await toolStep?.run("browserAction", async () => {
                    const sandbox = await getSandbox(sandboxId);
                    
                    const commandId = Math.random().toString(36).substring(7);
                    const command = {
                        id: commandId,
                        action,
                        args: args || {}
                    };

                    // Write command to sandbox
                    // Atomic write to prevent partial-read race conditions in daemon
                    await sandbox.files.write('/home/user/browser-command.tmp.json', JSON.stringify(command));
                    await sandbox.commands.run('mv /home/user/browser-command.tmp.json /home/user/browser-command.json');

                    // Poll for response (max 30 seconds)
                    const startTime = Date.now();
                    const timeoutMs = 30000;
                    
                    while (Date.now() - startTime < timeoutMs) {
                        try {
                            const responseContent = await sandbox.files.read('/home/user/browser-response.json');
                            if (responseContent) {
                                const response = JSON.parse(responseContent);
                                // Ensure we're reading the response for our command
                                // Or at least that the daemon has written a new response
                                if (response.id === commandId) {
                                    // Clear response to avoid re-reading
                                    await sandbox.commands.run(`rm -f /home/user/browser-response.json`);
                                    return JSON.stringify({
                                        success: response.success,
                                        action,
                                        data: response.data,
                                        error: response.error
                                    });
                                }
                            }
                        } catch (e) {
                            // File might not exist yet, that's fine, keep polling
                        }
                        
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }

                    return JSON.stringify({
                        success: false,
                        action,
                        error: "Timeout waiting for browser daemon response"
                    });
                });

                return result;
            } catch (error) {
                return JSON.stringify({
                    success: false,
                    action,
                    error: `Failed to execute browser action: ${error instanceof Error ? error.message : String(error)}`
                });
            }
        },
    });
};

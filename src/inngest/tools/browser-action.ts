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
                "evaluate"
            ]).describe("The browser action to perform"),
            args: z.record(z.string(), z.any()).optional().describe("Arguments specific to the action (e.g. url, selector, text)"),
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
                    await sandbox.files.write('/tmp/browser-command.json', JSON.stringify(command));

                    // Poll for response (max 30 seconds)
                    const startTime = Date.now();
                    const timeoutMs = 30000;
                    
                    while (Date.now() - startTime < timeoutMs) {
                        try {
                            const responseContent = await sandbox.files.read('/tmp/browser-response.json');
                            if (responseContent) {
                                const response = JSON.parse(responseContent);
                                // Ensure we're reading the response for our command
                                // Or at least that the daemon has written a new response
                                if (response.id === commandId) {
                                    // Clear response to avoid re-reading
                                    await sandbox.commands.run(`rm -f /tmp/browser-response.json`);
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

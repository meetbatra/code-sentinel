import "dotenv/config";
import { Sandbox } from "e2b";
import { createBrowserActionTool } from "./src/inngest/tools/browser-action";

async function main() {
    console.log("Creating dev sandbox...");
    const sandbox = await Sandbox.create("code-sentinel-dev", {
        apiKey: process.env.E2B_API_KEY,
        timeoutMs: 300000
    });

    console.log("Sandbox ID:", sandbox.sandboxId);

    console.log("Starting browser client...");
    await sandbox.commands.run("npm run browser-client", { background: true });

    // Wait for the client to potentially start
    await new Promise(r => setTimeout(r, 2000));

    console.log("Running browser action: navigate...");
    const tool = createBrowserActionTool({ sandboxId: sandbox.sandboxId });
    
    const fakeStep = { run: async (name: string, fn: any) => await fn() };

    // Test navigate
    const navResult = await tool.handler({ action: "navigate", args: { url: "https://example.com" } }, { step: fakeStep as any });
    console.log("Navigate result:", navResult);

    // Test screenshot
    const shotResult = await tool.handler({ action: "screenshot", args: { path: "/tmp/shot.png" } }, { step: fakeStep as any });
    console.log("Screenshot result:", shotResult);

    // Test missing selector
    const missingResult = await tool.handler({ action: "click", args: { selector: "#does-not-exist" } }, { step: fakeStep as any });
    console.log("Missing selector result:", missingResult);

    await sandbox.kill();
}

main().catch(console.error);

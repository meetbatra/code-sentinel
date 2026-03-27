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

    const tool = createBrowserActionTool({ sandboxId: sandbox.sandboxId });
    const fakeStep = { run: async (name: string, fn: any) => await fn() };
    const h = async (args: any) => JSON.parse(await tool.handler(args, { step: fakeStep } as any) as string);

    console.log("--- Test 1 & 2: Capture Request and Response Body ---");
    // We navigate to a dummy JSON API directly to generate a network request that returns JSON
    await h({ action: "navigate", args: { url: "https://jsonplaceholder.typicode.com/todos/1" } });
    
    let logsRes = await h({ action: "get-network-logs" });
    console.log("Total logs:", logsRes.data?.logs?.length);
    console.log("First log:", JSON.stringify(logsRes.data?.logs?.[0], null, 2));

    console.log("\n--- Test 3: Filter Logs ---");
    let filteredRes = await h({ action: "get-network-logs", args: { filter: "typicode" } });
    console.log("Filtered logs count:", filteredRes.data?.logs?.length);

    console.log("\n--- Test 4: Detect Failures ---");
    await h({ action: "navigate", args: { url: "https://jsonplaceholder.typicode.com/invalid-endpoint-404" } });
    let failureRes = await h({ action: "get-network-logs", args: { statusCode: 404 } });
    console.log("404 logs count:", failureRes.data?.logs?.length);
    if (failureRes.data?.logs?.length > 0) {
        console.log("404 log URL:", failureRes.data.logs[0].url);
    }

    console.log("\n--- Test 5: Clear Logs ---");
    await h({ action: "clear-network-logs" });
    let clearedRes = await h({ action: "get-network-logs" });
    console.log("Logs after clear:", clearedRes.data?.logs?.length);

    await sandbox.kill();
}

main().catch(console.error);

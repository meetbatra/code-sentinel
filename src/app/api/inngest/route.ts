import { serve } from "inngest/next";
import { inngest } from "@/features/agent/client";
import { testAgentFunction } from "@/features/agent/functions";

export const { GET, POST, PUT } = serve({
    client: inngest,
    functions: [
        testAgentFunction,
    ],
});
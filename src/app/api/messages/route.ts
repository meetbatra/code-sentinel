import { NextRequest, NextResponse } from "next/server";

const BEDROCK_REGION = "ap-south-1";
const MODEL_ID = "global.anthropic.claude-haiku-4-5-20251001-v1:0";
const BEDROCK_URL = `https://bedrock-runtime.${BEDROCK_REGION}.amazonaws.com/model/${encodeURIComponent(MODEL_ID)}/invoke`;

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        console.log("🔵 Raw body from AgentKit:", JSON.stringify(body, null, 2));

        // Strip fields Bedrock doesn't accept
        const {
            model,        // Bedrock gets model from the URL
            stream,       // handle separately if needed
            ...bedrockBody
        } = body;

        // Bedrock requires this
        bedrockBody["anthropic_version"] = "bedrock-2023-05-31";

        console.log("🔵 Cleaned body sent to Bedrock:", JSON.stringify(bedrockBody, null, 2));

        const response = await fetch(BEDROCK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.AWS_BEARER_TOKEN_BEDROCK}`,
            },
            body: JSON.stringify(bedrockBody),
        });

        console.log("🟢 Bedrock status:", response.status);
        const data = await response.json();
        console.log("🟢 Bedrock response:", JSON.stringify(data, null, 2));

        return NextResponse.json(data, { status: response.status });

    } catch (error) {
        console.error("🔴 Proxy error:", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
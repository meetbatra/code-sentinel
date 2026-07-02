import { NextRequest, NextResponse } from "next/server";

const BEDROCK_REGION = process.env.BEDROCK_REGION ?? "ap-south-1";
// Nova Pro now frequently requires invocation via an inference profile ID.
const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? "apac.amazon.nova-pro-v1:0";
const BEDROCK_URL = `https://bedrock-runtime.${BEDROCK_REGION}.amazonaws.com/model/${MODEL_ID}/converse`;

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        console.log("🔵 Raw AgentKit body:", JSON.stringify(body, null, 2));

        // --- Translate Anthropic format → Nova Converse format ---

        // System prompt
        const system = body.system
            ? [{ text: typeof body.system === "string" ? body.system : body.system[0]?.text }]
            : undefined;

        // Messages: Anthropic format -> Nova Converse format.
        let previousAssistantToolUseIds = new Set<string>();
        const messages = (body.messages || []).map((msg: any) => {
            const blocks = typeof msg.content === "string" ? [{ type: "text", text: msg.content }] : (msg.content || []);
            const currentAssistantToolUseIds = new Set<string>();
            const content = blocks.flatMap((block: any) => {
                if (block.type === "text") return [{ text: block.text }];

                // Assistant tool calls must be forwarded as toolUse blocks.
                if (block.type === "tool_use") {
                    if (block.id) currentAssistantToolUseIds.add(block.id);
                    return [{
                        toolUse: {
                            toolUseId: block.id,
                            name: block.name,
                            input: block.input ?? {},
                        }
                    }];
                }

                // User tool results must match a previous toolUseId.
                if (block.type === "tool_result") {
                    if (!block.tool_use_id || !previousAssistantToolUseIds.has(block.tool_use_id)) {
                        return [];
                    }
                    return [{
                        toolResult: {
                            toolUseId: block.tool_use_id,
                            content: [{
                                text: typeof block.content === "string"
                                    ? block.content
                                    : JSON.stringify(block.content)
                            }]
                        }
                    }];
                }

                return [{ text: JSON.stringify(block) }];
            });

            if (msg.role === "assistant") {
                previousAssistantToolUseIds = currentAssistantToolUseIds;
            }

            return {
                role: msg.role,
                content,
            };
        });

        // Tools: Anthropic format → Nova toolSpec format
        const toolConfig = body.tools?.length ? {
            tools: body.tools.map((tool: any) => ({
                toolSpec: {
                    name: tool.name,
                    description: tool.description,
                    inputSchema: { json: tool.input_schema },
                }
            }))
        } : undefined;

        const novaBody: any = {
            messages,
            inferenceConfig: {
                maxTokens: body.max_tokens || 4096,
                temperature: body.temperature,
            },
        };
        if (system) novaBody.system = system;
        if (toolConfig) novaBody.toolConfig = toolConfig;

        console.log("🔵 Nova body:", JSON.stringify(novaBody, null, 2));

        const response = await fetch(BEDROCK_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.AWS_BEARER_TOKEN_BEDROCK}`,
            },
            body: JSON.stringify(novaBody),
        });

        const novaResponse = await response.json();
        console.log("🟢 Nova response:", JSON.stringify(novaResponse, null, 2));

        if (!response.ok) {
            return NextResponse.json(novaResponse, { status: response.status });
        }

        // --- Translate Nova response → Anthropic format ---
        const outputMessage = novaResponse.output?.message;
        const content = (outputMessage?.content || []).map((block: any) => {
            if (block.text !== undefined) return { type: "text", text: block.text };
            if (block.toolUse) return {
                type: "tool_use",
                id: block.toolUse.toolUseId,
                name: block.toolUse.name,
                input: block.toolUse.input,
            };
            return { type: "text", text: JSON.stringify(block) };
        });

        const anthropicResponse = {
            id: `msg_${Date.now()}`,
            type: "message",
            role: "assistant",
            content,
            model: MODEL_ID,
            stop_reason: novaResponse.stopReason === "tool_use" ? "tool_use" : "end_turn",
            stop_sequence: null,
            usage: {
                input_tokens: novaResponse.usage?.inputTokens || 0,
                output_tokens: novaResponse.usage?.outputTokens || 0,
            },
        };

        console.log("🟢 Anthropic-format response:", JSON.stringify(anthropicResponse, null, 2));
        return NextResponse.json(anthropicResponse);

    } catch (error) {
        console.error("🔴 Proxy error:", error);
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}

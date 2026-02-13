
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { projectId, chatId, content, previousMessages } = await req.json();

        if (!projectId || !chatId || !content) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        // 1. Save User Message
        const { error: insertError } = await supabase.from("chat_messages").insert({
            chat_id: chatId,
            role: "user",
            content: content
        });

        if (insertError) {
            console.error("Failed to save user message:", insertError);
            throw new Error(`Database Error: ${insertError.message}`);
        }

        // 2. Get Global Base Prompt
        const { data: basePromptData } = await supabase
            .from("app_config")
            .select("value")
            .eq("key", "agent_base_prompt")
            .single();
        const basePrompt = basePromptData?.value || "You are a helpful AI assistant.";

        // 3. Get Project System Prompt
        const { data: project } = await supabase
            .from("projects")
            .select("system_prompt")
            .eq("id", projectId)
            .single();
        let systemPrompt = `${basePrompt}\n\n${project?.system_prompt || ""}`;

        // 4. Get Project Memories
        const { data: memories } = await supabase
            .from("project_memories")
            .select("memory_type, content, sentiment, importance")
            .eq("project_id", projectId)
            .order("importance", { ascending: false })
            .limit(10);

        if (memories && memories.length > 0) {
            const memoryContext = memories.map(m =>
                `[${m.memory_type.toUpperCase()}] ${m.content} (Importance: ${m.importance}/10)`
            ).join("\n");
            systemPrompt += `\n\n## Project Memory Context\nThe following are important insights and context from previous conversations in this project:\n\n${memoryContext}\n\nUse this context to provide more relevant and personalized responses.`;
        }

        // 5. Build Payload
        const messagesPayload = previousMessages.map((m: any) => ({
            role: m.role,
            content: m.content
        }));
        messagesPayload.push({ role: "user", content });

        const payload = {
            messages: messagesPayload,
            system_prompt: systemPrompt,
            model: "openai:gpt-5", // User preference from chat.ts
            stream: true,
            chat_id: chatId, // Pass chat_id so server can log directly to DB
            // enable_research: true // Optional: could be passed from client if needed
        };

        // 6. Call Python Server
        // Note: Using fetch with streaming response capability
        const response = await fetch("https://agent-salesforce-link.replit.app/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!response.ok || !response.body) {
            const errorText = await response.text();
            throw new Error(`Agent Server Error: ${response.status} - ${errorText}`);
        }

        // 7. Create Streaming Response
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        let fullResponse = "";
        let thinkingSteps: string[] = [];

        const stream = new ReadableStream({
            async start(controller) {
                const reader = response.body?.getReader();
                if (!reader) {
                    controller.close();
                    return;
                }

                try {
                    let buffer = ""; // Add buffer specifically for processing complete server events

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        // Pass chunk to client immediately if stream is open
                        try {
                            controller.enqueue(value);
                        } catch (e) {
                            // Controller might be closed if client disconnected
                            console.warn("Stream closed while enqueuing:", e);
                            break;
                        }

                        // Process chunk for final save
                        const chunkStr = decoder.decode(value, { stream: true });
                        console.log("Raw Chunk:", chunkStr);
                        buffer += chunkStr;

                        const lines = buffer.split('\n\n');
                        // Keep the last part in the buffer
                        buffer = lines.pop() || "";

                        for (const line of lines) {
                            if (line.startsWith('data: ')) {
                                const jsonStr = line.slice(6);
                                if (jsonStr === '[DONE]') continue;

                                try {
                                    const data = JSON.parse(jsonStr);

                                    // Capture 'thinking' events (legacy simple status)
                                    if (data.type === 'thinking' && data.content) {
                                        // thinkingSteps.push(data.content); // Use tool_call for detail instead
                                    }

                                    // Capture detailed tool calls
                                    if (data.type === 'tool_call') {
                                        const toolInfo = `Calling **${data.tool}** with args: \`${JSON.stringify(data.args)}\``;
                                        thinkingSteps.push(toolInfo);
                                    }

                                    // Capture tool results
                                    if (data.type === 'tool_result') {
                                        // Truncate very long results for display cleanliness, but keep enough context
                                        const resultStr = data.result.length > 500 ? data.result.slice(0, 500) + "... (truncated)" : data.result;
                                        const resultInfo = `Result from **${data.tool}**: \n> ${resultStr.replace(/\n/g, '\n> ')}`;
                                        thinkingSteps.push(resultInfo);
                                    }

                                    // Accumulate 'token' content
                                    if (data.type === 'token' && data.content) {
                                        fullResponse += data.content;
                                    }

                                    // Handle 'final' content if sent as a block
                                    if (data.type === 'final' && data.content) {
                                        if (!fullResponse) fullResponse = data.content;
                                    }
                                } catch (e) {
                                    console.error("Error parsing chunk JSON", e);
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error("Stream reading error:", err);
                    controller.error(err);
                } finally {
                    try {
                        controller.close();
                    } catch (e) {
                        // Ignore close errors
                    }

                    // 8. Save Assistant Message to DB on completion
                    // DEPRECATED: The Python server now handles saving to DB directly if chat_id is provided.
                    /*
                    if (fullResponse) {
                        // ... (previous logic for saving thinking steps + response)
                        let finalContent = fullResponse;
                        
                        // We rely on server.py to save the rich log now.
                        // Uncomment below ONLY if server.py is NOT configured with DB credentials.
                        
                        // const { error: assistantInsertError } = await supabase.from("chat_messages").insert({
                        //     chat_id: chatId,
                        //     role: "assistant",
                        //     content: finalContent
                        // });

                        // if (assistantInsertError) {
                        //     console.error("Failed to save assistant message:", assistantInsertError);
                        // }
                    }
                    */
                }
            }
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive"
            }
        });

    } catch (error: any) {
        console.error("Stream Route Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

"use client";

import { createElement, useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Send, User, Bot, Paperclip, File as FileIcon, Loader2, Mic, MicOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChartRenderer } from "@/components/chat/ChartRenderer";

interface ChatProps {
    projectId: string;
    chatId: string;
    initialMessages: any[];
}

export function ChatInterface({ projectId, chatId, initialMessages }: ChatProps) {
    // Process initial messages (consolidate tokens/events)
    const processedInitialMessages = initialMessages.reduce((acc: any[], msg: any) => {
        if (msg.role === 'user') {
            acc.push(msg);
        } else if (msg.role === 'assistant') {
            const lastMsg = acc[acc.length - 1];
            const type = msg.type || 'message';

            // Check if we should append to the last assistant message
            if (lastMsg && lastMsg.role === 'assistant') {
                switch (type) {
                    case 'token':
                        lastMsg.content = (lastMsg.content || "") + (msg.content || "");
                        break;
                    case 'tool_call':
                        let args = "";
                        if (msg.metadata && msg.metadata.args) {
                            try {
                                args = typeof msg.metadata.args === 'string' ? msg.metadata.args : JSON.stringify(msg.metadata.args, null, 2);
                            } catch (e) { args = JSON.stringify(msg.metadata.args); }
                        }
                        const toolInfo = `Called **${msg.metadata?.tool || msg.metadata?.name || "Unknown Tool"}**${args ? ` with args:\n\`\`\`json\n${args}\n\`\`\`` : ""}`;
                        lastMsg.thinkingSteps = [...(lastMsg.thinkingSteps || []), toolInfo];
                        break;
                    case 'tool_result':
                        lastMsg.thinkingSteps = [...(lastMsg.thinkingSteps || []), `Result: ${msg.content}`];
                        break;
                    case 'thinking':
                        lastMsg.thinkingSteps = [...(lastMsg.thinkingSteps || []), msg.content];
                        break;
                    case 'final':
                        if (msg.content && msg.content.length > (lastMsg.content || "").length) {
                            lastMsg.content = msg.content;
                        }
                        lastMsg.isProcessing = false;
                        break;
                    case 'status':
                        lastMsg.status = msg.content;
                        if (msg.content === 'processing' || msg.content === 'started') {
                            lastMsg.isProcessing = true;
                        } else {
                            lastMsg.isProcessing = false;
                        }
                        break;
                    case 'error':
                        lastMsg.content = `Error: ${msg.content}`;
                        lastMsg.isProcessing = false;
                        break;
                    default:
                        if (type === 'message' && msg.content) lastMsg.content = (lastMsg.content || "") + msg.content;
                }
            } else {
                // New assistant block
                const newMsg = { ...msg, thinkingSteps: [], isProcessing: false, content: "" };

                if (type === 'token') {
                    newMsg.content = msg.content || "";
                } else if (type === 'tool_call') {
                    let args = "";
                    if (msg.metadata && msg.metadata.args) {
                        try {
                            args = typeof msg.metadata.args === 'string' ? msg.metadata.args : JSON.stringify(msg.metadata.args, null, 2);
                        } catch (e) { args = JSON.stringify(msg.metadata.args); }
                    }
                    newMsg.thinkingSteps = [`Called **${msg.metadata?.tool || msg.metadata?.name || "Unknown Tool"}**${args ? ` with args:\n\`\`\`json\n${args}\n\`\`\`` : ""}`];
                    newMsg.isProcessing = true;
                } else if (type === 'thinking') {
                    newMsg.thinkingSteps = [msg.content];
                    newMsg.isProcessing = true;
                } else if (type === 'status') {
                    newMsg.status = msg.content;
                    newMsg.isProcessing = (msg.content === 'processing' || msg.content === 'started');
                } else if (type === 'message') {
                    newMsg.content = msg.content || "";
                }
                acc.push(newMsg);
            }
        }
        return acc;
    }, []);

    // State definitions
    const [messages, setMessages] = useState<any[]>(processedInitialMessages);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [thinkingText, setThinkingText] = useState("");
    const [realtimeStatus, setRealtimeStatus] = useState<'connecting' | 'connected' | 'error' | 'disconnected'>('connecting');
    const [isRecording, setIsRecording] = useState(false);

    // Refs
    const scrollRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const recognitionRef = useRef<any>(null);
    const supabase = createClient();

    // Scroll to bottom on messages change
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    // Realtime Subscription
    useEffect(() => {
        if (!chatId) {
            console.warn("[Realtime] No chatId provided, skipping subscription.");
            return;
        }
        console.log(`[Realtime] Setting up subscription for chat:${chatId}`);

        const channel = supabase
            .channel(`chat:${chatId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'chat_messages',
                    filter: `chat_id=eq.${chatId}`
                },
                (payload: any) => {
                    const newMsg = payload.new;
                    setMessages(prev => {
                        // 1. Handle User Messages (Deduplication)
                        if (newMsg.role === 'user') {
                            const lastMsg = prev[prev.length - 1];
                            if (lastMsg && lastMsg.role === 'user' && lastMsg.content === newMsg.content && lastMsg.id !== newMsg.id) {
                                const newMessages = [...prev];
                                newMessages[prev.length - 1] = { ...lastMsg, id: newMsg.id };
                                return newMessages;
                            }
                            if (!prev.some(m => m.id === newMsg.id)) {
                                return [...prev, newMsg];
                            }
                            return prev;
                        }

                        // 2. Handle Assistant Events
                        if (newMsg.role === 'assistant') {
                            const type = newMsg.type || 'message';
                            const newMessages = [...prev];
                            let lastMsgIndex = newMessages.length - 1;
                            let lastMsg = newMessages[lastMsgIndex];

                            if (!lastMsg || lastMsg.role !== 'assistant') {
                                const placeholder = { role: 'assistant', content: "", thinkingSteps: [], id: newMsg.id, isProcessing: true };
                                newMessages.push(placeholder);
                                lastMsgIndex = newMessages.length - 1;
                                lastMsg = placeholder;
                            }

                            switch (type) {
                                case 'token':
                                    if (newMsg.content && newMsg.content.length >= (lastMsg.content || "").length) {
                                        newMessages[lastMsgIndex] = {
                                            ...lastMsg,
                                            content: newMsg.content
                                        };
                                    }
                                    break;
                                case 'tool_call':
                                    let args = "";
                                    if (newMsg.metadata) {
                                        let meta = newMsg.metadata;
                                        if (typeof meta === 'string') {
                                            try { meta = JSON.parse(meta); } catch (e) { }
                                        }
                                        const rawArgs = meta.args || {};
                                        try {
                                            args = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs, null, 2);
                                        } catch (e) { args = JSON.stringify(rawArgs); }

                                        const toolName = meta.tool || meta.name || "Unknown Tool";
                                        const toolInfo = `Called **${toolName}**${args ? ` with args:\n\`\`\`json\n${args}\n\`\`\`` : ""}`;

                                        newMessages[lastMsgIndex] = {
                                            ...lastMsg,
                                            thinkingSteps: [...(lastMsg.thinkingSteps || []), toolInfo],
                                            isProcessing: true
                                        };
                                    }
                                    break;
                                case 'tool_result':
                                    const resultText = newMsg.content;
                                    newMessages[lastMsgIndex] = {
                                        ...lastMsg,
                                        thinkingSteps: [...(lastMsg.thinkingSteps || []), `Result: ${resultText}`]
                                    };
                                    break;
                                case 'thinking':
                                    newMessages[lastMsgIndex] = {
                                        ...lastMsg,
                                        thinkingSteps: [...(lastMsg.thinkingSteps || []), newMsg.content]
                                    };
                                    break;
                                case 'status':
                                    setThinkingText(newMsg.content || "Processing...");
                                    newMessages[lastMsgIndex] = {
                                        ...lastMsg,
                                        status: newMsg.content,
                                        isProcessing: (newMsg.content === 'processing' || newMsg.content === 'started')
                                    };
                                    if (newMsg.content === 'done' || newMsg.content === 'completed') {
                                        newMessages[lastMsgIndex].isProcessing = false;
                                        setLoading(false);
                                    }
                                    break;
                                case 'final':
                                    newMessages[lastMsgIndex] = {
                                        ...lastMsg,
                                        content: newMsg.content,
                                        isProcessing: false
                                    };
                                    setLoading(false);
                                    break;
                                case 'error':
                                    newMessages[lastMsgIndex] = {
                                        ...lastMsg,
                                        content: `Error: ${newMsg.content}`,
                                        isProcessing: false
                                    };
                                    setLoading(false);
                                    break;
                                default:
                                    if (newMsg.content) {
                                        const current = lastMsg.content || "";
                                        if (newMsg.content.startsWith(current)) {
                                            newMessages[lastMsgIndex].content = newMsg.content;
                                        } else {
                                            newMessages[lastMsgIndex].content = current + newMsg.content;
                                        }
                                    }
                            }
                            return newMessages;
                        }
                        return prev;
                    });
                }
            )
            .subscribe((status) => {
                console.log(`[Realtime] Subscription status for chat:${chatId}:`, status);
                if (status === 'SUBSCRIBED') setRealtimeStatus('connected');
                else if (status === 'CHANNEL_ERROR') setRealtimeStatus('error');
                else if (status === 'TIMED_OUT') setRealtimeStatus('error');
                else if (status === 'CLOSED') setRealtimeStatus('disconnected');
            });

        return () => {
            supabase.removeChannel(channel);
        };
    }, [chatId, supabase]);

    const handleSend = async (messageContent: string = input) => {
        if (!messageContent.trim()) return;

        const tempId = crypto.randomUUID();
        const userMsg = { role: "user", content: messageContent, id: tempId };
        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setLoading(true);
        setThinkingText("Thinking...");

        // Placeholder for assistant message
        const assistantMsgId = crypto.randomUUID();
        setMessages(prev => [...prev, {
            role: "assistant",
            content: "",
            id: assistantMsgId,
            thinkingSteps: [],
            isProcessing: true
        }]);

        try {
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectId,
                    chatId,
                    content: messageContent,
                    previousMessages: messages
                })
            });

            if (!response.ok) {
                throw new Error(await response.text());
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (reader) {
                console.log("[ChatInterface] Reading stream...");
                let buffer = "";

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    buffer += chunk;

                    const lines = buffer.split("\n\n");
                    buffer = lines.pop() || ""; // Keep the last incomplete line

                    for (const line of lines) {
                        if (line.startsWith("data: ")) {
                            try {
                                const jsonStr = line.slice(6);
                                if (jsonStr.trim() === "[DONE]") continue;
                                const data = JSON.parse(jsonStr);

                                // Handle different event types from the stream
                                setMessages(prev => {
                                    const newMessages = [...prev];
                                    const lastMsgIndex = newMessages.length - 1;
                                    const lastMsg = newMessages[lastMsgIndex];

                                    // Ensure we are updating the assistant message
                                    if (!lastMsg || lastMsg.role !== 'assistant') return prev;

                                    if (data.type === 'token' || data.type === 'content') {
                                        const text = data.content || data.token || "";
                                        // If content is just appended
                                        newMessages[lastMsgIndex] = {
                                            ...lastMsg,
                                            content: (lastMsg.content || "") + text
                                        };
                                    } else if (data.type === 'tool_call') {
                                        const meta = data.metadata || {};
                                        let args = "";
                                        const rawArgs = data.args || meta.args || {};
                                        try {
                                            args = typeof rawArgs === 'string' ? rawArgs : JSON.stringify(rawArgs, null, 2);
                                        } catch (e) { args = JSON.stringify(rawArgs); }

                                        const toolName = data.tool || meta.tool || meta.name || "Unknown Tool";
                                        const toolInfo = `Called **${toolName}**${args ? ` with args:\n\`\`\`json\n${args}\n\`\`\`` : ""}`;

                                        newMessages[lastMsgIndex] = {
                                            ...lastMsg,
                                            thinkingSteps: [...(lastMsg.thinkingSteps || []), toolInfo],
                                            isProcessing: true
                                        };
                                    } else if (data.type === 'tool_result') {
                                        const resultText = data.content;
                                        newMessages[lastMsgIndex] = {
                                            ...lastMsg,
                                            thinkingSteps: [...(lastMsg.thinkingSteps || []), `Result: ${resultText}`]
                                        };
                                    } else if (data.type === 'thinking') {
                                        newMessages[lastMsgIndex] = {
                                            ...lastMsg,
                                            thinkingSteps: [...(lastMsg.thinkingSteps || []), data.content]
                                        };
                                    } else if (data.type === 'status') {
                                        setThinkingText(data.content || "Processing...");
                                        // Update status if needed
                                    } else if (data.type === 'final' || data.type === 'complete') {
                                        newMessages[lastMsgIndex].isProcessing = false;
                                        if (data.content && data.content.length > (lastMsg.content || "").length) {
                                            newMessages[lastMsgIndex].content = data.content;
                                        }
                                    } else if (data.type === 'error') {
                                        newMessages[lastMsgIndex].content += `\n\nError: ${data.content}`;
                                        newMessages[lastMsgIndex].isProcessing = false;
                                    }

                                    return newMessages;
                                });

                            } catch (e) {
                                console.error("Error parsing stream JSON", e, line);
                            }
                        }
                    }
                }
                console.log("[ChatInterface] Stream finished.");
            }
            setLoading(false);

        } catch (e: any) {
            console.error(e);
            setMessages(prev => [...prev, { role: "assistant", content: `Error: ${e.message || "Failed to start chat."}` }]);
            setLoading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

        const file = e.target.files[0];
        setUploading(true);
        const filePath = `chat/${chatId}/${Date.now()}_${file.name}`;

        try {
            const { error } = await supabase.storage
                .from("project-files")
                .upload(filePath, file);

            if (error) throw error;

            const { data: { publicUrl } } = supabase.storage
                .from("project-files")
                .getPublicUrl(filePath);

            const fileMessage = `[File Uploaded: ${file.name}](${publicUrl})`;
            await handleSend(fileMessage);

        } catch (error: any) {
            console.error("Upload failed", error);
            alert("Upload failed: " + error.message);
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    // Initialize speech recognition
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (SpeechRecognition) {
                console.log('Speech recognition available');
                recognitionRef.current = new SpeechRecognition();
                recognitionRef.current.continuous = true;
                recognitionRef.current.interimResults = true;
                recognitionRef.current.lang = 'en-US';

                recognitionRef.current.onstart = () => {
                    console.log('Speech recognition started');
                };

                recognitionRef.current.onresult = (event: any) => {
                    let finalTranscript = '';
                    let interimTranscript = '';

                    for (let i = event.resultIndex; i < event.results.length; i++) {
                        const transcript = event.results[i][0].transcript;
                        if (event.results[i].isFinal) {
                            finalTranscript += transcript + ' ';
                        } else {
                            interimTranscript += transcript;
                        }
                    }

                    if (finalTranscript) {
                        console.log('Final transcript:', finalTranscript);
                        setInput(prev => prev + (prev ? ' ' : '') + finalTranscript.trim());
                    }
                };

                recognitionRef.current.onerror = (event: any) => {
                    console.error('Speech recognition error:', event.error);
                    setIsRecording(false);
                };

                recognitionRef.current.onend = () => {
                    console.log('Speech recognition ended');
                    setIsRecording(false);
                };
            }
        }
    }, []);

    const toggleVoiceInput = () => {
        if (!recognitionRef.current) {
            alert('Speech recognition is not supported in your browser.');
            return;
        }

        if (isRecording) {
            recognitionRef.current.stop();
            setIsRecording(false);
        } else {
            try {
                recognitionRef.current.start();
                setIsRecording(true);
            } catch (error) {
                console.error('Failed to start recognition:', error);
                alert('Failed to start voice input.');
            }
        }
    };

    return (
        <div className="flex flex-col h-full bg-background relative w-full max-w-full overflow-x-hidden">


            <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 md:p-4 space-y-4 w-full max-w-full" ref={scrollRef}>
                {messages.length === 0 && (
                    <div className="flex h-full items-center justify-center text-muted-foreground opacity-50 px-4 text-center">
                        Start a conversation or upload a file...
                    </div>
                )}
                {messages.map((msg, i) => (
                    <div key={i} className={`flex gap-2 md:gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'assistant' && (
                            <div className="h-6 w-6 md:h-8 md:w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                                <Bot className="h-3 w-3 md:h-5 md:w-5" />
                            </div>
                        )}
                        <div className={`rounded-lg p-2.5 md:p-3 min-w-0 max-w-[75%] md:max-w-[75%] lg:max-w-[70%] text-sm md:text-sm overflow-hidden break-words ${msg.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-foreground'
                            }`}>
                            {msg.role === 'user' ? (
                                <div className="whitespace-pre-wrap">
                                    {msg.content.split(/(\[File Uploaded: .*?\]\(.*?\))/g).map((part: string, index: number) => {
                                        const match = part.match(/\[File Uploaded: (.*?)\]\((.*?)\)/);
                                        if (match) {
                                            return (
                                                <a key={index} href={match[2]} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80 flex items-center gap-1">
                                                    <FileIcon className="h-4 w-4" />
                                                    {match[1]}
                                                </a>
                                            );
                                        }
                                        return part;
                                    })}
                                </div>
                            ) : (() => {
                                const rawContent = msg.content || "";
                                let thinkingContent = "";
                                let mainContent = rawContent;

                                if (rawContent.includes("### Thinking Process") && rawContent.includes("### Answer")) {
                                    const parts = rawContent.split("### Answer");
                                    thinkingContent = parts[0].replace("### Thinking Process", "").trim();
                                    mainContent = parts.slice(1).join("### Answer").trim();
                                }
                                else if (msg.thinkingSteps && msg.thinkingSteps.length > 0) {
                                    thinkingContent = msg.thinkingSteps.join("\n\n");
                                }

                                let displayContent = mainContent;
                                if (mainContent.trim().startsWith("[") && mainContent.includes("'type': 'text'")) {
                                    try {
                                        const textMatch = mainContent.match(/'text':\s*'((?:[^'\\]|\\.)*)'/);
                                        if (textMatch && textMatch[1]) {
                                            displayContent = textMatch[1]
                                                .replace(/\\n/g, '\n')
                                                .replace(/\\'/g, "'")
                                                .replace(/\\\\/g, "\\");
                                        }
                                    } catch (e) { }
                                }

                                return (
                                    <div className="flex flex-col gap-2 min-w-0 max-w-full">
                                        {thinkingContent && (
                                            <details className="group bg-black/5 rounded-md border border-border/50 overflow-hidden">
                                                <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-black/5 flex items-center select-none list-none">
                                                    <span className="mr-2 opacity-50 transition-transform group-open:rotate-90">▶</span>
                                                    Thinking Process
                                                </summary>
                                                <div className="px-3 py-2 border-t border-border/50 text-xs text-muted-foreground font-mono whitespace-pre-wrap break-all bg-black/5 max-h-[300px] overflow-y-auto">
                                                    {thinkingContent}
                                                </div>
                                            </details>
                                        )}

                                        {displayContent && (
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={{
                                                    code: ({ node, ...props }: any) => {
                                                        const match = /language-(\w+)/.exec((props.className || ''))
                                                        if (match && match[1] === 'chart') {
                                                            return <ChartRenderer jsonString={String(props.children).replace(/\n$/, '')} />
                                                        }
                                                        return !match ? (
                                                            <code className="bg-background/20 rounded px-1 break-all" {...props} />
                                                        ) : (
                                                            <code className="block whitespace-pre-wrap break-words text-xs md:text-sm" {...props} />
                                                        )
                                                    },
                                                    pre: ({ node, ...props }: any) => (
                                                        <pre className="bg-background/20 p-2 rounded my-2 overflow-x-auto max-w-full" {...props} />
                                                    ),
                                                    img: ({ node, ...props }: any) => (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img className="max-w-full h-auto rounded-lg my-2" {...props} alt={props.alt || "Image"} />
                                                    ),
                                                    p: ({ node, ...props }: any) => (
                                                        <p className="break-words mb-2 last:mb-0" {...props} />
                                                    ),
                                                    a: ({ node, ...props }: any) => (
                                                        <a className="text-primary underline hover:opacity-80 break-all" target="_blank" rel="noopener noreferrer" {...props} />
                                                    ),
                                                    ul: ({ node, ...props }: any) => (
                                                        <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />
                                                    ),
                                                    ol: ({ node, ...props }: any) => (
                                                        <ol className="list-decimal pl-4 mb-2 space-y-1" {...props} />
                                                    ),
                                                    li: ({ node, ...props }: any) => (
                                                        <li className="break-words" {...props} />
                                                    ),
                                                    blockquote: ({ node, ...props }: any) => (
                                                        <blockquote className="border-l-4 border-primary/50 pl-4 py-1 italic bg-muted/50 rounded-r my-2 break-words" {...props} />
                                                    ),
                                                    table: ({ node, ...props }: any) => (
                                                        <div className="overflow-x-auto my-4 rounded-lg border border-border max-w-full">
                                                            <table className="w-full text-sm text-left border-collapse" {...props} />
                                                        </div>
                                                    ),
                                                    thead: ({ node, ...props }: any) => (
                                                        <thead className="bg-muted text-muted-foreground uppercase text-xs" {...props} />
                                                    ),
                                                    tbody: ({ node, ...props }: any) => (
                                                        <tbody className="divide-y divide-border" {...props} />
                                                    ),
                                                    tr: ({ node, ...props }: any) => (
                                                        <tr className="bg-card hover:bg-muted/50 transition-colors" {...props} />
                                                    ),
                                                    hr: ({ node, ...props }: any) => (
                                                        <hr className="my-4 border-border" {...props} />
                                                    ),
                                                    th: ({ node, ...props }: any) => (
                                                        <th className="px-4 py-3 font-medium whitespace-nowrap" {...props} />
                                                    ),
                                                    td: ({ node, ...props }: any) => (
                                                        <td className="px-4 py-3 whitespace-nowrap md:whitespace-normal" {...props} />
                                                    )
                                                }}
                                            >
                                                {displayContent}
                                            </ReactMarkdown>
                                        )}

                                        {(msg.isProcessing || (loading && i === messages.length - 1)) && (
                                            <div className="flex items-center gap-2 mt-2 text-muted-foreground">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                <span className="text-xs">{thinkingText || "Processing..."}</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                        {msg.role === 'user' && (
                            <div className="h-6 w-6 md:h-8 md:w-8 rounded-full bg-secondary flex items-center justify-center shadow-sm flex-shrink-0">
                                <User className="h-3 w-3 md:h-4 md:w-4" />
                            </div>
                        )}
                    </div>
                ))}

                {loading && messages.length > 0 && messages[messages.length - 1].role !== 'assistant' && (
                    <div className="flex gap-2 md:gap-3 justify-start items-center">
                        <div className="h-6 w-6 md:h-8 md:w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                            <Bot className="h-3 w-3 md:h-5 md:w-5" />
                        </div>
                        <div className="bg-muted p-3 rounded-lg">
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        </div>
                    </div>
                )}
            </div>

            <div className="p-2 md:p-4 border-t bg-card flex gap-2 items-center w-full max-w-full">
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileUpload}
                    accept=".pdf,.csv,.xls,.xlsx,.txt,image/*"
                />
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading || uploading}
                    className="h-8 w-8 md:h-10 md:w-10 shrink-0"
                >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                </Button>

                <Button
                    variant={isRecording ? "destructive" : "outline"}
                    size="icon"
                    onClick={toggleVoiceInput}
                    disabled={loading}
                    className={`h-8 w-8 md:h-10 md:w-10 shrink-0 ${isRecording ? "animate-pulse" : ""}`}
                >
                    {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>

                <input
                    className="flex-1 bg-background border rounded-md px-3 py-2 text-base md:text-sm focus:outline-none focus:ring-2 focus:ring-primary min-w-0"
                    placeholder={isRecording ? "Listening..." : "Type a message..."}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    disabled={loading}
                />

                <Button
                    onClick={() => handleSend()}
                    disabled={loading || !input.trim()}
                    size="icon"
                    className="h-8 w-8 md:h-10 md:w-10 shrink-0"
                >
                    <Send className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}

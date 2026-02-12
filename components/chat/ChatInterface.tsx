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
    const [messages, setMessages] = useState(initialMessages);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = async (messageContent: string = input) => {
        if (!messageContent.trim()) return;

        const userMsg = { role: "user", content: messageContent };
        setMessages(prev => [...prev, userMsg]);
        setInput("");
        setLoading(true);

        const { sendMessage } = await import("@/lib/actions/chat");

        try {
            const result = await sendMessage(projectId, chatId, messageContent, messages);
            if (result.success && result.message) {
                setMessages(prev => [...prev, { role: "assistant", content: result.message }]);
            } else {
                console.error("Message failed:", result.error);
                setMessages(prev => [...prev, { role: "assistant", content: "Error: Failed to get response." }]);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

        const file = e.target.files[0];
        setUploading(true);

        const supabase = createClient();
        const filePath = `chat/${chatId}/${Date.now()}_${file.name}`;

        try {
            const { data, error } = await supabase.storage
                .from("project-files")
                .upload(filePath, file);

            if (error) throw error;

            // Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from("project-files")
                .getPublicUrl(filePath);

            const fileMessage = `[File Uploaded: ${file.name}](${publicUrl})`;

            // Send as a message
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
                recognitionRef.current.continuous = true; // Keep recording until manually stopped
                recognitionRef.current.interimResults = true; // Show results as you speak
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
                    alert(`Speech recognition error: ${event.error}`);
                    setIsRecording(false);
                };

                recognitionRef.current.onend = () => {
                    console.log('Speech recognition ended');
                    setIsRecording(false);
                };
            } else {
                console.error('Speech recognition not supported');
            }
        }
    }, []);

    const toggleVoiceInput = () => {
        if (!recognitionRef.current) {
            alert('Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari.');
            return;
        }

        if (isRecording) {
            console.log('Stopping recording');
            recognitionRef.current.stop();
            setIsRecording(false);
        } else {
            console.log('Starting recording');
            try {
                recognitionRef.current.start();
                setIsRecording(true);
            } catch (error) {
                console.error('Failed to start recognition:', error);
                alert('Failed to start voice input. Please try again.');
            }
        }
    };

    return (
        <div className="flex flex-col h-full bg-background">
            <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
                {messages.length === 0 && (
                    <div className="flex h-full items-center justify-center text-muted-foreground opacity-50">
                        Start a conversation or upload a file...
                    </div>
                )}
                {messages.map((msg, i) => (
                    <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        {msg.role === 'assistant' && (
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                                <Bot className="h-5 w-5" />
                            </div>
                        )}
                        <div className={`rounded-lg p-3 max-w-[80%] text-sm overflow-hidden ${msg.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-foreground'
                            }`}>
                            {msg.role === 'user' ? (
                                // For user messages, keep simple text rendering to avoid markdown parsing of simple inputs if preferred, 
                                // but markdown for user input is also fine. Let's stick to simple text for user to match typical chat apps, 
                                // or minimal markdown. 
                                // Actually, simpler:
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
                            ) : (
                                // For assistant messages, use ReactMarkdown
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        // Text Structure
                                        h1: ({ node, ...props }: any) => <h1 className="text-2xl font-bold mt-6 mb-4 pb-2 border-b border-border/50" {...props} />,
                                        h2: ({ node, ...props }: any) => <h2 className="text-xl font-semibold mt-5 mb-3 text-foreground/90" {...props} />,
                                        h3: ({ node, ...props }: any) => <h3 className="text-lg font-medium mt-4 mb-2 text-foreground/80" {...props} />,
                                        p: ({ node, ...props }: any) => <p className="leading-7 [&:not(:first-child)]:mt-4 text-base" {...props} />,
                                        ul: ({ node, ...props }: any) => <ul className="my-4 ml-6 list-disc [&>li]:mt-2" {...props} />,
                                        ol: ({ node, ...props }: any) => <ol className="my-4 ml-6 list-decimal [&>li]:mt-2" {...props} />,
                                        li: ({ node, ...props }: any) => <li className="leading-7" {...props} />,
                                        blockquote: ({ node, ...props }: any) => <blockquote className="mt-6 border-l-2 border-primary pl-6 italic text-muted-foreground" {...props} />,

                                        // Tables
                                        table: ({ node, ...props }: any) => (
                                            <div className="overflow-x-auto my-6 rounded-lg border bg-card shadow-sm">
                                                <table className="w-full text-sm" {...props} />
                                            </div>
                                        ),
                                        thead: ({ node, ...props }: any) => <thead className="bg-muted/50 text-muted-foreground font-medium" {...props} />,
                                        tr: ({ node, ...props }: any) => <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted" {...props} />,
                                        th: ({ node, ...props }: any) => <th className="h-10 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0" {...props} />,
                                        td: ({ node, ...props }: any) => <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0" {...props} />,

                                        // Links & Code
                                        a: ({ node, ...props }: any) => <a className="font-medium underline underline-offset-4 decoration-primary text-primary hover:text-primary/80 transition-colors" target="_blank" rel="noopener noreferrer" {...props} />,
                                        code: ({ node, ...props }: any) => {
                                            const match = /language-(\w+)/.exec((props.className || ''))
                                            if (match && match[1] === 'chart') {
                                                return <ChartRenderer jsonString={String(props.children).replace(/\n$/, '')} />
                                            }
                                            return !match ? (
                                                <code className="bg-background/20 rounded px-1" {...props} />
                                            ) : (
                                                <code className="block bg-background/20 p-2 rounded my-2 whitespace-pre-wrap overflow-x-auto" {...props} />
                                            )
                                        }
                                    }}
                                >
                                    {msg.content}
                                </ReactMarkdown>
                            )}
                        </div>
                        {msg.role === 'user' && (
                            <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shadow-sm flex-shrink-0">
                                <User className="h-4 w-4" />
                            </div>
                        )}
                    </div>
                ))}
                {loading && (
                    <div className="flex gap-3 justify-start">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                            <Bot className="h-5 w-5" />
                        </div>
                        <div className="bg-muted p-3 rounded-lg flex items-center gap-1">
                            <span className="w-2 h-2 bg-foreground/30 rounded-full animate-bounce"></span>
                            <span className="w-2 h-2 bg-foreground/30 rounded-full animate-bounce delay-75"></span>
                            <span className="w-2 h-2 bg-foreground/30 rounded-full animate-bounce delay-150"></span>
                        </div>
                    </div>
                )}
            </div>
            <div className="p-4 border-t bg-card flex gap-2">
                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileUpload}
                    // Accept common types
                    accept=".pdf,.csv,.xls,.xlsx,.txt,image/*"
                />
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading || uploading}
                >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                </Button>

                <Button
                    variant={isRecording ? "destructive" : "outline"}
                    size="icon"
                    onClick={toggleVoiceInput}
                    disabled={loading}
                    className={isRecording ? "animate-pulse" : ""}
                >
                    {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>

                <input
                    className="flex-1 bg-background border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder={isRecording ? "Listening..." : "Type a message..."}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                    disabled={loading}
                />
                <Button onClick={() => handleSend()} disabled={loading || !input.trim()} size="icon">
                    <Send className="h-4 w-4" />
                </Button>
            </div>
        </div>
    );
}

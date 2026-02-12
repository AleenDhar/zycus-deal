import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { MemoryManager } from "@/components/projects/MemoryManager";
import { getProjectMemories } from "@/lib/actions/memories";

export const dynamic = "force-dynamic";

export default async function ChatPage({ params }: { params: Promise<{ id: string; chatId: string }> }) {
    const { id: projectId, chatId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return <div>Please login first.</div>;
    }

    // Verify project access
    const { data: project } = await supabase
        .from("projects")
        .select("id, name")
        .eq("id", projectId)
        .single();

    if (!project) notFound();

    // Verify chat access
    const { data: chat } = await supabase
        .from("chats")
        .select("*")
        .eq("id", chatId)
        .eq("project_id", projectId)
        .single();

    if (!chat) notFound();

    // Fetch messages
    const { data: messages } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });

    // Fetch memories
    const memories = await getProjectMemories(projectId);

    return (
        <div className="flex flex-col h-full gap-4">
            <div className="flex items-center justify-between border-b pb-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{project.name} Agent</h1>
                    <p className="text-sm text-muted-foreground">Chat ID: {chatId.substring(0, 8)}...</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full">
                <div className="lg:col-span-3 h-full">
                    <ChatInterface
                        projectId={projectId}
                        chatId={chatId}
                        initialMessages={messages || []}
                    />
                </div>
                <div className="space-y-6 h-full overflow-y-auto pr-2">
                    <MemoryManager
                        projectId={projectId}
                        chatId={chatId}
                        memories={memories}
                    />
                </div>
            </div>
        </div>
    );
}

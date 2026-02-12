import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { MessageSquarePlus } from "lucide-react";
import Link from "next/link";
import { createNewChat } from "@/lib/actions/chat";
import { SystemPromptCard } from "@/components/projects/SystemPromptCard";
import { ProjectFiles } from "@/components/projects/ProjectFiles";

export const dynamic = "force-dynamic";

import { getProjectMemories } from "@/lib/actions/memories";
import { MemoryManager } from "@/components/projects/MemoryManager";

import { VisibilityToggle } from "@/components/projects/VisibilityToggle";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return <div>Please login first.</div>;
    }

    // Fetch project details
    const { data: project, error } = await supabase
        .from("projects")
        .select("*")
        .eq("id", id)
        .single();

    if (error || !project) {
        notFound();
    }

    const isOwner = project.owner_id === user.id;

    // Fetch active chats for this project
    const { data: chats } = await supabase
        .from("chats")
        .select("*")
        .eq("project_id", id)
        // Only show my chats if not owner, or all chats if owner? 
        // Actually, adhering to "User sees OWN chats" policy from DB migration
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

    // Fetch documents
    const { data: documents } = await supabase
        .from("documents")
        .select("*")
        .eq("project_id", id)
        .order("created_at", { ascending: false });

    // Fetch memories
    const memories = await getProjectMemories(id);

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-2 border-b pb-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
                        <VisibilityToggle
                            projectId={project.id}
                            initialVisibility={project.visibility || 'private'}
                            canEdit={isOwner}
                        />
                    </div>
                    <form action={async () => {
                        "use server";
                        const { createNewChat } = await import("@/lib/actions/chat");
                        const { id: chatId } = await createNewChat(project.id);
                        if (chatId) {
                            const { redirect } = await import("next/navigation");
                            redirect(`/projects/${project.id}/chat/${chatId}`);
                        }
                    }}>
                        <Button>
                            <MessageSquarePlus className="mr-2 h-4 w-4" />
                            New Chat
                        </Button>
                    </form>
                </div>
                <p className="text-muted-foreground text-lg">
                    {project.description || "No description provided."}
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <div className="md:col-span-2 space-y-6">
                    <h2 className="text-xl font-semibold">Conversations</h2>
                    {chats && chats.length > 0 ? (
                        <div className="grid gap-3">
                            {chats.map((chat: { id: string; title: string; created_at: string }) => (
                                <Link key={chat.id} href={`/projects/${project.id}/chat/${chat.id}`}>
                                    <div className="border rounded-xl hover:bg-accent/50 transition-colors p-4 block">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="font-medium">{chat.title}</h3>
                                                <p className="text-xs text-muted-foreground">
                                                    {new Date(chat.created_at).toLocaleDateString()}
                                                </p>
                                            </div>
                                            <MessageSquarePlus className="h-4 w-4 text-muted-foreground" />
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="text-center py-12 border rounded-xl bg-muted/30">
                            <MessageSquarePlus className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                            <h3 className="font-medium text-muted-foreground">No conversations yet</h3>
                            <p className="text-sm text-muted-foreground/80 mt-1">Start a new chat to analyze this deal.</p>
                        </div>
                    )}

                    <ProjectFiles projectId={project.id} initialFiles={documents || []} />
                </div>

                <div className="space-y-6">
                    <SystemPromptCard projectId={project.id} initialPrompt={project.system_prompt} />
                    <MemoryManager projectId={project.id} memories={memories} />
                </div>
            </div>
        </div>
    );
}

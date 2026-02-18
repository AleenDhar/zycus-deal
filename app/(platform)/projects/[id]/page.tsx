import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { MessageSquarePlus, ArrowLeft, MoreHorizontal, Star, Plus, ArrowUp } from "lucide-react";
import Link from "next/link";
import { SystemPromptCard } from "@/components/projects/SystemPromptCard";
import { ProjectFiles } from "@/components/projects/ProjectFiles";
import { getProjectMemories } from "@/lib/actions/memories";
import { MemoryManager } from "@/components/projects/MemoryManager";
import { VisibilityToggle } from "@/components/projects/VisibilityToggle";

export const dynamic = "force-dynamic";

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
        <div className="flex flex-col w-full max-w-screen-xl mx-auto px-4 py-6">
            {/* Back Link */}
            <div className="mb-6">
                <Link href="/projects" className="text-sm text-muted-foreground flex items-center hover:text-foreground transition-colors">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    All projects
                </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                {/* Main Content (Left) */}
                <div className="lg:col-span-2 space-y-8">
                    {/* Header Section */}
                    <div className="space-y-4">
                        <div className="flex items-start justify-between">
                            <h1 className="text-3xl md:text-4xl font-serif font-medium tracking-tight text-foreground">
                                {project.name}
                            </h1>
                            <div className="flex items-center gap-2 text-muted-foreground">
                                <Button variant="ghost" size="icon">
                                    <MoreHorizontal className="h-5 w-5" />
                                </Button>
                                <Button variant="ghost" size="icon">
                                    <Star className="h-5 w-5" />
                                </Button>
                            </div>
                        </div>
                        <p className="text-lg text-muted-foreground/90 leading-relaxed">
                            {project.description || "No description provided."}
                        </p>
                        
                        {/* Visibility Control (Hidden visually unless owner, or kept as layout element?) 
                            Keeping it but maybe less prominent as per design, or integrating later.
                        */}
                         <div className="flex items-center gap-2">
                            <VisibilityToggle
                                projectId={project.id}
                                initialVisibility={project.visibility || 'private'}
                                canEdit={isOwner}
                            />
                        </div>
                    </div>

                    {/* Chat Input Mock (Routes to New Chat) */}
                    <form action={async () => {
                        "use server";
                        const { createNewChat } = await import("@/lib/actions/chat");
                        const { id: chatId } = await createNewChat(project.id);
                        if (chatId) {
                            const { redirect } = await import("next/navigation");
                            redirect(`/projects/${project.id}/chat/${chatId}`);
                        }
                    }} className="w-full">
                        <div className="relative group cursor-text">
                            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent rounded-3xl -z-10 opacity-50" />
                            <div className="flex flex-col justify-between h-40 w-full rounded-3xl border bg-card/50 backdrop-blur-sm p-4 shadow-sm transition-all hover:border-primary/50 hover:shadow-md">
                                <textarea 
                                    className="w-full bg-transparent border-none resize-none focus:ring-0 p-2 text-lg placeholder:text-muted-foreground/70"
                                    placeholder="Reply..."
                                    readOnly // Read only because it's a trigger for a new chat page
                                />
                                <div className="flex items-center justify-between px-2">
                                    <Button variant="ghost" size="icon" type="button" className="text-muted-foreground hover:text-foreground">
                                        <Plus className="h-6 w-6" />
                                    </Button>
                                    <div className="flex items-center gap-3">
                                         <span className="text-sm text-muted-foreground hidden sm:inline-block">Opus 4.6 Extended</span>
                                         <Button type="submit" size="icon" className="rounded-full h-10 w-10 bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
                                             <ArrowUp className="h-5 w-5" />
                                         </Button>
                                    </div>
                                </div>
                                 {/* Cover the textarea to make the whole top area clickable to focus or separate? 
                                     Actually for a "Mock", making the button the main trigger is safest server-action wise, 
                                     but let's make the button type="submit" do the work.
                                 */}
                            </div>
                        </div>
                    </form>

                    {/* Recent Chats List */}
                    <div className="space-y-4 pt-4">
                        {chats && chats.length > 0 ? (
                            <div className="space-y-2">
                                {/* <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Recent Conversations</h3> */}
                                {chats.map((chat: { id: string; title: string; created_at: string }) => (
                                    <Link key={chat.id} href={`/projects/${project.id}/chat/${chat.id}`} className="block group">
                                        <div className="flex flex-col gap-1 py-4 border-b border-border/50 group-hover:bg-accent/30 rounded-lg px-4 transition-all">
                                            <h3 className="font-medium text-lg group-hover:text-primary transition-colors">
                                                {chat.title || "Untitled Conversation"}
                                            </h3>
                                            <p className="text-sm text-muted-foreground">
                                                Last message {new Date(chat.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-12">
                                <p className="text-muted-foreground">No conversations yet.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Sidebar (Col Span 1) */}
                <div className="space-y-8">
                     {/* Memory Section */}
                    <div className="p-1">
                        <h3 className="font-medium mb-4 flex items-center justify-between">
                            Memory
                            <span className="text-[10px] bg-secondary px-2 py-0.5 rounded text-muted-foreground border">Only you</span>
                        </h3>
                         <div className="text-sm text-muted-foreground">
                            {/* Passing memories to manager, but layout-wise it replaces the content */}
                            <MemoryManager projectId={project.id} memories={memories} />
                         </div>
                    </div>

                    {/* Instructions Section */}
                    <div className="p-1">
                        <SystemPromptCard projectId={project.id} initialPrompt={project.system_prompt} />
                    </div>

                    {/* Files Section */}
                    <div className="p-1">
                        <ProjectFiles projectId={project.id} initialFiles={documents || []} />
                    </div>
                </div>
            </div>
        </div>
    );
}

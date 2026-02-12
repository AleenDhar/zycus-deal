import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import Link from "next/link";
import { FolderPlus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let projects = [];
    if (user) {
        const { data } = await supabase
            .from("projects")
            .select("*")
            .order("created_at", { ascending: false });
        projects = data || [];
    }

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
                <Button asChild>
                    <Link href="/projects/new">
                        <FolderPlus className="mr-2 h-4 w-4" />
                        New Project
                    </Link>
                </Button>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {projects.length === 0 ? (
                    <Card className="col-span-full border-dashed">
                        <CardHeader className="text-center">
                            <CardTitle>No Projects Found</CardTitle>
                            <CardDescription>
                                Get started by creating your first deal project.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex justify-center pb-6">
                            <Button variant="outline" asChild>
                                <Link href="/projects/new">
                                    Create Project
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    projects.map((project) => (
                        <Link key={project.id} href={`/projects/${project.id}`}>
                            <Card className="h-full transition-all hover:border-primary hover:shadow-md cursor-pointer">
                                <CardHeader>
                                    <CardTitle>{project.name}</CardTitle>
                                    <CardDescription className="line-clamp-2">
                                        {project.description || "No description provided."}
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                                        <span>
                                            {new Date(project.created_at).toLocaleDateString()}
                                        </span>
                                        <span className="capitalize px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium">
                                            {project.status}
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))
                )}
            </div>
        </div>
    );
}

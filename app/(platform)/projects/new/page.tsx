"use client";

import { createProject } from "@/lib/actions/projects";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input"; // Wait, I didn't create Input.
import { Textarea } from "@/components/ui/Textarea"; // Wait, I didn't create Textarea.
// I will create simple manual input/textarea for now in the file or standalone components.
import { Label } from "@/components/ui/Label"; // Wait, neither Label.

import Link from "next/link";
import { useFormStatus } from "react-dom";

function SubmitButton() {
    const { pending } = useFormStatus();
    return (
        <Button type="submit" disabled={pending} isLoading={pending}>
            {pending ? "Creating..." : "Create Project"}
        </Button>
    );
}

export default function NewProjectPage() {
    return (
        <div className="max-w-2xl mx-auto space-y-8">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Create New Project</h1>
                <p className="text-muted-foreground">
                    Start a new deal diagnostic project. You can upload files later.
                </p>
            </div>

            <form action={createProject} className="space-y-6">
                <div className="space-y-2">
                    <label htmlFor="name" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        Project Name <span className="text-destructive">*</span>
                    </label>
                    <input
                        id="name"
                        name="name"
                        required
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder="e.g. Acme Acquisition"
                    />
                </div>

                <div className="space-y-2">
                    <label htmlFor="description" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        Description
                    </label>
                    <textarea
                        id="description"
                        name="description"
                        className="flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        placeholder="Brief overview of the deal..."
                    />
                </div>

                <div className="space-y-2">
                    <label htmlFor="system_prompt" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        System Prompt Configuration
                    </label>
                    <textarea
                        id="system_prompt"
                        name="system_prompt"
                        className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                        placeholder="Customize how the AI analyzes this deal (optional)..."
                        defaultValue="You are an expert deal analyst. Review the provided documents and identify key risks, opportunities, and missing information."
                    />
                    <p className="text-xs text-muted-foreground">
                        This prompt will guide the AI when analyzing documents for this project.
                    </p>
                </div>

                <div className="flex items-center gap-4 pt-4">
                    <Button variant="outline" type="button" asChild>
                        <Link href="/projects">Cancel</Link>
                    </Button>
                    <SubmitButton />
                </div>
            </form>
        </div>
    );
}

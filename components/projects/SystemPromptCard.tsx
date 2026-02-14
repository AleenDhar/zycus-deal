"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Pencil, Save, X } from "lucide-react";

interface SystemPromptCardProps {
    projectId: string;
    initialPrompt: string | null;
}

export function SystemPromptCard({ projectId, initialPrompt }: SystemPromptCardProps) {
    const [isEditing, setIsEditing] = useState(false);
    const [prompt, setPrompt] = useState(initialPrompt || "");
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);

        const { updateSystemPrompt } = await import("@/lib/actions/projects");
        const result = await updateSystemPrompt(projectId, prompt);

        if (result.success) {
            setIsEditing(false);
        } else {
            alert("Failed to save: " + result.error);
        }

        setSaving(false);
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>System Prompt</CardTitle>
                        <CardDescription>AI Configuration</CardDescription>
                    </div>
                    {!isEditing ? (
                        <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                        </Button>
                    ) : (
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => {
                                setPrompt(initialPrompt || "");
                                setIsEditing(false);
                            }}>
                                <X className="h-4 w-4 mr-2" />
                                Cancel
                            </Button>
                            <Button size="sm" onClick={handleSave} disabled={saving}>
                                <Save className="h-4 w-4 mr-2" />
                                {saving ? "Saving..." : "Save"}
                            </Button>
                        </div>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {isEditing ? (
                    <textarea
                        className="w-full min-h-[200px] bg-background border rounded-md p-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Enter system prompt..."
                    />
                ) : (
                    <div className="bg-muted p-3 rounded-md text-xs font-mono text-muted-foreground whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                        {prompt || "Default system prompt applied."}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

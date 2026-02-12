"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Loader2, Save } from "lucide-react";
import { updateBasePrompt } from "@/lib/actions/admin";

export function PromptEditor({ initialPrompt }: { initialPrompt: string }) {
    const [prompt, setPrompt] = useState(initialPrompt);
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        const result = await updateBasePrompt(prompt);
        setSaving(false);

        if (result.success) {
            alert("✅ Base prompt updated successfully!");
        } else {
            alert("❌ Error updating prompt: " + result.error);
        }
    };

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-semibold">Agent Base Prompt</h2>
            <p className="text-sm text-muted-foreground">
                This prompt defines the core behavior and persona of the AI agent for ALL projects.
            </p>
            <textarea
                className="w-full h-64 p-4 border rounded-md font-mono text-sm bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="You are a helpful assistant..."
            />
            <div className="flex justify-end">
                <Button onClick={handleSave} disabled={saving}>
                    {saving ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                        </>
                    ) : (
                        <>
                            <Save className="mr-2 h-4 w-4" />
                            Save Base Prompt
                        </>
                    )}
                </Button>
            </div>
        </div>
    );
}

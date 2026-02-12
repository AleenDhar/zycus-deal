"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Lock, Globe, Loader2 } from "lucide-react";
import { updateProjectVisibility } from "@/lib/actions/projects";

interface Props {
    projectId: string;
    initialVisibility: 'private' | 'public';
    canEdit: boolean;
}

export function VisibilityToggle({ projectId, initialVisibility, canEdit }: Props) {
    const [visibility, setVisibility] = useState(initialVisibility);
    const [loading, setLoading] = useState(false);

    if (!canEdit) {
        return (
            <div className="flex items-center gap-2 text-muted-foreground text-sm border px-3 py-1 rounded-full bg-muted/50">
                {visibility === 'private' ? <Lock className="h-3 w-3" /> : <Globe className="h-3 w-3" />}
                <span className="capitalize">{visibility}</span>
            </div>
        );
    }

    const toggle = async () => {
        setLoading(true);
        const newVisibility = visibility === 'private' ? 'public' : 'private';
        const res = await updateProjectVisibility(projectId, newVisibility);

        if (res?.success) {
            setVisibility(newVisibility);
        } else {
            alert("Failed to update visibility");
        }
        setLoading(false);
    };

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={toggle}
            disabled={loading}
            className="gap-2 h-9"
            title={visibility === 'private' ? "Click to make Public" : "Click to make Private"}
        >
            {loading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
            ) : visibility === 'private' ? (
                <Lock className="h-3 w-3 text-muted-foreground" />
            ) : (
                <Globe className="h-3 w-3 text-primary" />
            )}
            <span className={visibility === 'public' ? "text-primary font-medium" : ""}>
                {visibility === 'private' ? "Private" : "Public"}
            </span>
        </Button>
    );
}

"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Upload, FileText, Loader2, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface ProjectFilesProps {
    projectId: string;
    initialFiles: any[];
}

export function ProjectFiles({ projectId, initialFiles }: ProjectFilesProps) {
    const [files, setFiles] = useState(initialFiles);
    const [uploading, setUploading] = useState(false);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

        const file = e.target.files[0];
        setUploading(true);

        const supabase = createClient();
        const filePath = `projects/${projectId}/${Date.now()}_${file.name}`;

        try {
            // Upload to storage
            const { error: uploadError } = await supabase.storage
                .from("project-files")
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            // Save metadata via server action
            const { addDocument } = await import("@/lib/actions/documents");
            const result = await addDocument(projectId, file.name, filePath);

            if (result.success) {
                // Refresh the page to show new file
                window.location.reload();
            } else {
                throw new Error(result.error);
            }
        } catch (error: any) {
            console.error("Upload failed:", error);
            alert("Upload failed: " + error.message);
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (docId: string, filePath: string) => {
        if (!confirm("Are you sure you want to delete this file?")) return;

        const supabase = createClient();

        try {
            // Delete from storage
            await supabase.storage.from("project-files").remove([filePath]);

            // Delete metadata via server action
            const { deleteDocument } = await import("@/lib/actions/documents");
            const result = await deleteDocument(docId);

            if (result.success) {
                window.location.reload();
            } else {
                throw new Error(result.error);
            }
        } catch (error: any) {
            console.error("Delete failed:", error);
            alert("Delete failed: " + error.message);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold">Project Files</h2>
                <label>
                    <input
                        type="file"
                        className="hidden"
                        onChange={handleUpload}
                        disabled={uploading}
                        accept=".pdf,.csv,.xls,.xlsx,.txt,.doc,.docx,image/*"
                    />
                    <Button variant="outline" disabled={uploading} asChild>
                        <span>
                            {uploading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Uploading...
                                </>
                            ) : (
                                <>
                                    <Upload className="mr-2 h-4 w-4" />
                                    Upload File
                                </>
                            )}
                        </span>
                    </Button>
                </label>
            </div>

            {files && files.length > 0 ? (
                <div className="grid gap-3">
                    {files.map((doc: any) => (
                        <Card key={doc.id} className="p-4 hover:bg-accent/50 transition-colors">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                                        <FileText className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <h4 className="font-medium text-sm">{doc.name}</h4>
                                        <p className="text-xs text-muted-foreground">
                                            {new Date(doc.created_at).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-muted-foreground hover:text-destructive"
                                    onClick={() => handleDelete(doc.id, doc.file_path)}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            ) : (
                <div className="text-center py-12 border rounded-xl bg-muted/30">
                    <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                    <h3 className="font-medium text-muted-foreground">No files uploaded</h3>
                    <p className="text-sm text-muted-foreground/80 mt-1">
                        Upload documents to provide context for the AI.
                    </p>
                </div>
            )}
        </div>
    );
}

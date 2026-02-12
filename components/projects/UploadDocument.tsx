"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import { useState, useRef } from "react";
import { Upload } from "lucide-react";
import { addDocument } from "@/lib/actions/documents";

export function UploadDocument({ projectId }: { projectId: string }) {
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleButtonClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;

        const file = e.target.files[0];
        setIsUploading(true);

        try {
            const supabase = createClient();
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
            const filePath = `${projectId}/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('project-files')
                .upload(filePath, file);

            if (uploadError) {
                throw uploadError;
            }

            // Call Server Action to save metadata
            const formData = new FormData();
            formData.append("projectId", projectId);
            formData.append("name", file.name);
            formData.append("filePath", filePath);

            const response = await addDocument(formData);
            if (response?.error) {
                throw new Error(response.error);
            }

            // Reset input
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }

        } catch (error: any) {
            console.error("Upload error:", error);
            alert(error.message || "Error uploading file.");
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="flex items-center gap-4">
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                onChange={handleFileChange}
                disabled={isUploading}
            />
            <Button
                variant="outline"
                isLoading={isUploading}
                leftIcon={Upload}
                onClick={handleButtonClick}
            >
                Upload Document
            </Button>
        </div>
    );
}

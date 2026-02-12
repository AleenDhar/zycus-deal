"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function createProject(formData: FormData) {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        redirect("/");
    }

    const name = formData.get("name") as string;
    const description = formData.get("description") as string;
    const systemPrompt = formData.get("system_prompt") as string;

    if (!name) {
        console.error("Project name is required");
        redirect("/projects/new");
        return;
    }

    const { error } = await supabase.from("projects").insert({
        name,
        description,
        system_prompt: systemPrompt,
        owner_id: user.id
    });

    if (error) {
        console.error("Create Project Error:", error);
        redirect("/projects/new");
        return;
    }

    revalidatePath("/projects");
    redirect("/projects");
}

export async function updateSystemPrompt(projectId: string, systemPrompt: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { error: "Unauthorized" };
    }

    const { error } = await supabase
        .from("projects")
        .update({ system_prompt: systemPrompt })
        .eq("id", projectId)
        .eq("owner_id", user.id);

    if (error) {
        console.error("Update System Prompt Error:", error);
        return { error: error.message };
    }

    revalidatePath(`/projects/${projectId}`);
    return { success: true };
}

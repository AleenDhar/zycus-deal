"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateUserRole(userId: string, newRole: "admin" | "user") {
    const supabase = await createClient();
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);

    if (error) {
        console.error("Update User Role Error:", error);
    }

    revalidatePath("/admin");
}

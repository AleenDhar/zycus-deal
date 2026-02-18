import { verifyAdmin, getBasePrompt, getAllUsers, getApiKeys } from "@/lib/actions/admin";
import { PromptEditor } from "@/components/admin/PromptEditor";
import { ApiKeyList } from "@/components/admin/ApiKeyList";
import { UserList } from "@/components/admin/UserList";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
    const isAdmin = await verifyAdmin();

    if (!isAdmin) {
        redirect("/");
    }

    const basePrompt = await getBasePrompt();
    const apiKeys = await getApiKeys();
    const users = await getAllUsers();

    return (
        <div className="flex flex-col gap-8 max-w-4xl mx-auto px-4 py-8">
            <h1 className="text-3xl font-bold tracking-tight mb-8">Admin Dashboard</h1>

            <section className="bg-card p-6 rounded-lg shadow-sm border space-y-6">
                <PromptEditor initialPrompt={basePrompt} />
            </section>

            <section className="bg-card p-6 rounded-lg shadow-sm border space-y-6">
                <ApiKeyList initialKeys={apiKeys} />
            </section>

            <section className="bg-card p-6 rounded-lg shadow-sm border space-y-6">
                <UserList initialUsers={users} />
            </section>
        </div>
    );
}

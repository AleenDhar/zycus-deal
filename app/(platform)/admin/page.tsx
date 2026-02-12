import { createClient } from "@/lib/supabase/server";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { updateUserRole } from "@/lib/actions/users";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return <div className="flex h-[50vh] items-center justify-center text-muted-foreground">Please log in to access the admin console.</div>;
    }

    // Verify admin access
    const { data: myProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    // For manual testing/demo purposes, we might want to allow the first user or skip check if empty.
    // But let's enforce it. If I'm not admin, I see unauthorized.
    // If table is empty, I'm stuck.
    // I can manually update my role in Supabase dashboard.

    const isAdmin = myProfile?.role === 'admin';

    // Fetch all profiles
    const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .order('role', { ascending: true }); // Admin first usually? 'admin' < 'user' alphabetically? 'admin' comes before 'user'.

    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Admin Console</h1>
                {!isAdmin && <span className="text-sm text-destructive bg-destructive/10 px-3 py-1 rounded-full">View Only (Not Admin)</span>}
            </div>

            <div className="rounded-xl border bg-card text-card-foreground shadow-sm">
                <div className="flex flex-col space-y-1.5 p-6">
                    <h3 className="font-semibold leading-none tracking-tight">User Management</h3>
                    <p className="text-sm text-muted-foreground">Manage user access and roles.</p>
                </div>
                <div className="p-6 pt-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>User</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Last Updated</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {profiles?.map((profile) => {
                                const isSelf = profile.id === user.id;
                                return (
                                    <TableRow key={profile.id}>
                                        <TableCell className="font-medium">
                                            <div className="flex flex-col">
                                                <span>{profile.full_name || 'Unknown User'}</span>
                                                <span className="text-xs text-muted-foreground">{profile.username || profile.email || 'No username'}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${profile.role === 'admin'
                                                    ? 'bg-purple-50 text-purple-700 ring-purple-600/20 dark:bg-purple-900/30 dark:text-purple-400'
                                                    : 'bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-900/30 dark:text-green-400'
                                                }`}>
                                                {profile.role}
                                            </span>
                                        </TableCell>
                                        <TableCell>{profile.updated_at ? new Date(profile.updated_at).toLocaleDateString() : 'N/A'}</TableCell>
                                        <TableCell className="text-right">
                                            {isAdmin && !isSelf && (
                                                <form action={updateUserRole.bind(null, profile.id, profile.role === 'admin' ? 'user' : 'admin')}>
                                                    <Button variant="ghost" size="sm" type="submit">
                                                        {profile.role === 'admin' ? 'Demote' : 'Promote'}
                                                    </Button>
                                                </form>
                                            )}
                                            {isSelf && <span className="text-xs text-muted-foreground italic">Current User</span>}
                                        </TableCell>
                                    </TableRow>
                                )
                            })}
                            {(!profiles || profiles.length === 0) && (
                                <TableRow>
                                    <TableCell colSpan={4} className="h-24 text-center">
                                        No users found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>
        </div>
    );
}

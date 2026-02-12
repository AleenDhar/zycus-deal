"use client";

import { useEffect, useState } from "react";
import { getAllUsers, updateUserRole } from "@/lib/actions/admin";
import { User, ShieldCheck, Mail } from "lucide-react";
import { Button } from "@/components/ui/Button";

interface UserProfile {
    id: string;
    username: string;
    full_name: string;
    role: string;
}

export function UserList({ initialUsers }: { initialUsers: UserProfile[] }) {
    const [users, setUsers] = useState(initialUsers);

    const handleRoleChange = async (userId: string, newRole: 'admin' | 'user') => {
        const result = await updateUserRole(userId, newRole);

        if (result.success) {
            setUsers(prev => prev.map(u =>
                u.id === userId ? { ...u, role: newRole } : u
            ));
            alert(`✅ Updated user role to ${newRole}!`);
        } else {
            alert("❌ Failed to update role: " + result.error);
        }
    };

    return (
        <div className="space-y-4">
            <h2 className="text-xl font-semibold">User Management</h2>
            <div className="grid gap-2">
                {users.map((user) => (
                    <div
                        key={user.id}
                        className="flex items-center justify-between p-4 border rounded-lg bg-card shadow-sm hover:shadow-md transition-all"
                    >
                        <div className="flex items-center gap-3">
                            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${user.role === 'admin' ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                                }`}>
                                {user.role === 'admin' ? <ShieldCheck className="h-5 w-5" /> : <User className="h-5 w-5" />}
                            </div>
                            <div>
                                <p className="font-medium flex items-center gap-2">
                                    {user.full_name || "Unnamed User"}
                                    {user.role === 'admin' && (
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                                            Admin
                                        </span>
                                    )}
                                </p>
                                <p className="text-xs text-muted-foreground">{user.username}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {user.role === 'user' ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleRoleChange(user.id, 'admin')}
                                >
                                    Make Admin
                                </Button>
                            ) : (
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => handleRoleChange(user.id, 'user')}
                                >
                                    Revoke Admin
                                </Button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

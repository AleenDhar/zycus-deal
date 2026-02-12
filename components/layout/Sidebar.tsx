"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    FolderOpen,
    Users,
    Settings,
    ShieldCheck,
    BarChart,
    LogOut,
    PanelLeftClose,
    PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { ModeToggle } from "@/components/ModeToggle";

const menuItems = [
    { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { name: "Projects", href: "/projects", icon: FolderOpen },
    { name: "Deal Analytics", href: "/analytics", icon: BarChart },
    { name: "Users", href: "/users", icon: Users },
    { name: "Admin Panel", href: "/admin", icon: ShieldCheck },
    { name: "Settings", href: "/settings", icon: Settings },
];

interface SidebarProps {
    isCollapsed: boolean;
    toggleCollapse: () => void;
}

export function Sidebar({ isCollapsed, toggleCollapse }: SidebarProps) {
    const pathname = usePathname();

    return (
        <aside
            className={cn(
                "fixed left-0 top-0 z-40 h-screen border-r bg-background/95 backdrop-blur transition-all duration-300 supports-[backdrop-filter]:bg-background/60",
                isCollapsed ? "w-16" : "w-64"
            )}
        >
            <div className="flex h-full flex-col px-3 py-4">
                {/* Header / Logo */}
                <div className={cn("mb-6 flex items-center justify-between", isCollapsed ? "justify-center px-0" : "px-2")}>
                    <div className="flex items-center">
                        <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-primary-foreground">
                            <BarChart className="h-5 w-5" />
                        </div>
                        {!isCollapsed && (
                            <span className="ml-3 text-xl font-bold tracking-tight text-foreground whitespace-nowrap">
                                Deal Intel
                            </span>
                        )}
                    </div>
                </div>

                {/* Toggle Button (moved to top-right of sidebar if expanded, or centered if collapsed) */}
                <div className={cn("mb-4 flex", isCollapsed ? "justify-center" : "justify-end px-2")}>
                    <Button variant="ghost" size="icon" onClick={toggleCollapse} title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}>
                        {isCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                    </Button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 space-y-1">
                    {menuItems.map((item) => {
                        const isActive = pathname.startsWith(item.href);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "flex items-center rounded-lg py-2 text-sm font-medium transition-colors",
                                    isCollapsed ? "justify-center px-2" : "px-3",
                                    isActive
                                        ? "bg-primary text-primary-foreground shadow-sm"
                                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                )}
                                title={isCollapsed ? item.name : undefined}
                            >
                                <item.icon className={cn("h-5 w-5 flex-shrink-0", !isCollapsed && "mr-3")} />
                                {!isCollapsed && <span>{item.name}</span>}
                            </Link>
                        );
                    })}
                </nav>

                {/* Footer Actions */}
                <div className="mt-auto border-t pt-4 space-y-2">
                    <div className={cn("flex items-center", isCollapsed ? "justify-center" : "px-3 justify-between")}>
                        <ModeToggle />
                        {!isCollapsed && <span className="text-sm font-medium text-muted-foreground ml-2">Theme</span>}
                    </div>
                </div>
            </div>
        </aside>
    );
}

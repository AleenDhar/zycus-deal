"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ArrowUpRight, DollarSign, Activity, AlertTriangle, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const deals = [
    {
        id: 1,
        name: "Project Alpha",
        client: "Acme Corp",
        value: "$1.2M",
        probability: "85%",
        risk: "Low",
        status: "Negotiation",
    },
    {
        id: 2,
        name: "Project Beta",
        client: "Globex Inc",
        value: "$750k",
        probability: "60%",
        risk: "Medium",
        status: "Discovery",
    },
    {
        id: 3,
        name: "Project Gamma",
        client: "Soylent Corp",
        value: "$2.5M",
        probability: "40%",
        risk: "High",
        status: "Proposal",
    },
];

export default function Dashboard() {
    return (
        <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                <div className="flex items-center gap-2">
                    <Button variant="outline">Download Report</Button>
                    <Button>New Deal</Button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Pipeline Value</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">$4,450,000</div>
                        <p className="text-xs text-muted-foreground">+20.1% from last month</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Deals</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">12</div>
                        <p className="text-xs text-muted-foreground">+3 new deals this week</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">42%</div>
                        <p className="text-xs text-muted-foreground">+5% from last quarter</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Avg Risk Score</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">Low-Medium</div>
                        <p className="text-xs text-muted-foreground">Stable over last 30 days</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4">
                    <CardHeader>
                        <CardTitle>Top Deals</CardTitle>
                        <CardDescription>
                            High value opportunities requiring attention.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {deals.map((deal) => (
                                <div
                                    key={deal.id}
                                    className="flex items-center justify-between rounded-lg border p-4 transition-all hover:bg-accent"
                                >
                                    <div className="flex flex-col gap-1">
                                        <span className="font-semibold">{deal.name}</span>
                                        <span className="text-sm text-muted-foreground">
                                            {deal.client}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4 text-sm">
                                        <div className="font-medium">{deal.value}</div>
                                        <div className={cn(
                                            "rounded-full px-2 py-0.5 text-xs font-medium",
                                            deal.risk === "Low" && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                                            deal.risk === "Medium" && "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
                                            deal.risk === "High" && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                        )}>
                                            {deal.risk} Risk
                                        </div>
                                        <Button variant="ghost" size="icon">
                                            <ArrowUpRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>Recent Activity</CardTitle>
                        <CardDescription>Latest updates on your deals.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4 text-sm">
                            <div className="flex items-start gap-4 border-l-2 border-primary pl-4">
                                <div className="flex flex-col gap-1">
                                    <span className="font-medium">Proposal sent to Acme Corp</span>
                                    <span className="text-xs text-muted-foreground">2 hours ago</span>
                                </div>
                            </div>
                            <div className="flex items-start gap-4 border-l-2 border-muted pl-4">
                                <div className="flex flex-col gap-1">
                                    <span className="font-medium">Meeting scheduled with Globex</span>
                                    <span className="text-xs text-muted-foreground">Today at 2:00 PM</span>
                                </div>
                            </div>
                            <div className="flex items-start gap-4 border-l-2 border-muted pl-4">
                                <div className="flex flex-col gap-1">
                                    <span className="font-medium">New document uploaded for Gamma</span>
                                    <span className="text-xs text-muted-foreground">Yesterday</span>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}



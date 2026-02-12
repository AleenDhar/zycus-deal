"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';

const data = [
    { name: 'Jan', deals: 4 },
    { name: 'Feb', deals: 3 },
    { name: 'Mar', deals: 7 },
    { name: 'Apr', deals: 2 },
    { name: 'May', deals: 6 },
    { name: 'Jun', deals: 8 },
];

export default function AnalyticsPage() {
    return (
        <div className="flex flex-col gap-6">
            <h1 className="text-3xl font-bold tracking-tight">Deal Analytics</h1>
            <Card>
                <CardHeader>
                    <CardTitle>Deal Volume</CardTitle>
                </CardHeader>
                <CardContent className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip
                                contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)' }}
                                itemStyle={{ color: 'var(--foreground)' }}
                            />
                            <Bar dataKey="deals" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
}

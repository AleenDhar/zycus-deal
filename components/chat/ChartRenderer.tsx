"use client";

import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area, PieChart, Pie, Cell } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

interface ChartData {
    type: "bar" | "line" | "area" | "pie";
    title?: string;
    description?: string;
    xAxisKey: string;
    data: any[];
    series: { name: string; key: string; color?: string }[];
}

const COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444", "#ec4899", "#6366f1"];

export function ChartRenderer({ jsonString }: { jsonString: string }) {
    let chartData: ChartData;
    try {
        chartData = JSON.parse(jsonString);
    } catch (e) {
        return <div className="text-destructive font-mono text-sm p-4 border border-destructive rounded opacity-75">Invalid Chart JSON</div>;
    }

    const { type, title, description, xAxisKey, data, series } = chartData;

    const renderChart = () => {
        switch (type) {
            case "bar":
                return (
                    <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey={xAxisKey} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        {series.map((s, idx) => (
                            <Bar key={s.key}
                                dataKey={s.key}
                                name={s.name}
                                fill={s.color || COLORS[idx % COLORS.length]}
                                radius={[4, 4, 0, 0]}
                            />
                        ))}
                    </BarChart>
                );
            case "line":
                return (
                    <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey={xAxisKey} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        {series.map((s, idx) => (
                            <Line key={s.key}
                                type="monotone"
                                dataKey={s.key}
                                name={s.name}
                                stroke={s.color || COLORS[idx % COLORS.length]}
                                activeDot={{ r: 8 }}
                                strokeWidth={2}
                            />
                        ))}
                    </LineChart>
                );
            case "area":
                return (
                    <AreaChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey={xAxisKey} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        {series.map((s, idx) => (
                            <Area key={s.key}
                                type="monotone"
                                dataKey={s.key}
                                name={s.name}
                                stroke={s.color || COLORS[idx % COLORS.length]}
                                fill={s.color || COLORS[idx % COLORS.length]}
                                fillOpacity={0.3}
                            />
                        ))}
                    </AreaChart>
                );
            case "pie":
                // For Pie charts, we usually only need ONE data series, or create multiple pies.
                // Assuming first series key is the value.
                const valKey = series[0]?.key || "value";
                const nameKey = xAxisKey || "name";

                return (
                    <PieChart margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey={valKey}
                            nameKey={nameKey}
                            label
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                    </PieChart>
                );
            default:
                return <div>Unsupported chart type: {type}</div>;
        }
    };

    return (
        <Card className="my-4 border shadow-sm">
            <CardHeader className="pb-2">
                {title && <CardTitle className="text-lg font-semibold">{title}</CardTitle>}
                {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </CardHeader>
            <CardContent>
                <div className="h-[300px] w-full min-w-0">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                        {renderChart()}
                    </ResponsiveContainer>
                </div>
            </CardContent>
        </Card>
    );
}

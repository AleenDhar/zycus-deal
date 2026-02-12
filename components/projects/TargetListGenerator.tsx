"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/Table";
import { Loader2, Download } from "lucide-react";
import { generateTargetList } from "@/lib/actions/agent";

interface CompanyRow {
    id: string;
    name: string;
    country: string;
    region: string;
    type: string;
}

export function TargetListGenerator() {
    const [isLoading, setIsLoading] = useState(false);
    const [result, setResult] = useState<CompanyRow[] | null>(null);
    const [summary, setSummary] = useState<string>("");

    const [criteria, setCriteria] = useState<string>("Industry – B2B SaaS / AI & Automation Software; Geography/Regions – North America, Europe, and APAC; Number of Companies – 50; Additional Criteria – Series B+ funded, 100–1000 employees, enterprise-focused, actively scaling sales/GTM teams, and using CRM tools like Salesforce");

    const handleGenerate = async () => {
        setIsLoading(true);
        setResult(null);
        setSummary("");

        try {
            const data = await generateTargetList(criteria);

            if (data.success && data.data) {
                // Parse the response string
                // Expected format: Summary line \n Header line (# | Name...) \n 1 | ...

                const lines = data.data.trim().split('\n').filter((line: string) => line.trim() !== "");

                // Usually first line is Summary
                let parsedSummary = "";
                let startIndex = 0;

                if (lines[0] && !lines[0].includes("|")) {
                    parsedSummary = lines[0];
                    startIndex = 1;
                } else if (lines[0] && lines[0].includes("Total Companies")) {
                    parsedSummary = lines[0];
                    startIndex = 1;
                }

                if (lines[startIndex] && lines[startIndex].includes("#")) {
                    startIndex++; // Skip header
                }

                const parsedRows: CompanyRow[] = [];

                for (let i = startIndex; i < lines.length; i++) {
                    const line = lines[i];
                    const parts = line.split('|').map((p: string) => p.trim());

                    if (parts.length >= 5) {
                        parsedRows.push({
                            id: parts[0],
                            name: parts[1],
                            country: parts[2],
                            region: parts[3],
                            type: parts[4]
                        });
                    }
                }

                setSummary(parsedSummary);
                setResult(parsedRows);
            } else {
                console.error("Agent failed:", data.error);
                alert("Failed to generate list: " + (data.error || "Unknown error"));
            }
        } catch (error: any) {
            console.error("Error calling agent:", error);
            alert("Error: " + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card className="w-full">
            <CardHeader>
                <CardTitle>AI Target List Generator</CardTitle>
                <CardDescription>Generate a list of target companies using AI Agent.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium">Criteria Prompt</label>
                    <textarea
                        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                        value={criteria}
                        onChange={(e) => setCriteria(e.target.value)}
                        placeholder="Define your target segment..."
                    />
                    <div className="flex justify-end">
                        <Button onClick={handleGenerate} disabled={isLoading}>
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Generating...
                                </>
                            ) : (
                                "Generate Target List"
                            )}
                        </Button>
                    </div>
                </div>

                {summary && (
                    <div className="bg-muted/50 p-3 rounded-md text-sm border">
                        <span className="font-semibold">Summary: </span> {summary}
                    </div>
                )}

                {result && result.length > 0 && (
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[50px]">#</TableHead>
                                    <TableHead>Company Name</TableHead>
                                    <TableHead>Country</TableHead>
                                    <TableHead>Region</TableHead>
                                    <TableHead>Type</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {result.map((row) => (
                                    <TableRow key={row.name + row.id}>
                                        <TableCell>{row.id}</TableCell>
                                        <TableCell className="font-medium">{row.name}</TableCell>
                                        <TableCell>{row.country}</TableCell>
                                        <TableCell>{row.region}</TableCell>
                                        <TableCell>{row.type}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

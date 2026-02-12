"use client";

import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { BarChart } from "lucide-react";
import { LoginButton } from "@/components/auth/LoginButton";

export default function Home() {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-background p-4">
      <div className="absolute inset-0 -z-10 h-full w-full bg-white [background:radial-gradient(125%_125%_at_50%_10%,#fff_40%,#63e_100%)] dark:bg-neutral-950 dark:[background:radial-gradient(125%_125%_at_50%_10%,#000_40%,#63e_100%)] opacity-30"></div>

      <div className="flex flex-col items-center space-y-6 text-center max-w-lg">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg">
          <BarChart className="h-8 w-8" />
        </div>

        <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl text-gradient">
          Deal Intelligence
        </h1>

        <p className="text-lg text-muted-foreground">
          Accelerate your deal flow with AI-driven diagnostics, risk assessment, and detailed analytics.
        </p>

        <div className="flex flex-col gap-4 w-full max-w-xs pt-4">
          <LoginButton />

          <Button variant="ghost" className="w-full" asChild>
            <Link href="/dashboard">
              Continue as Guest (Demo)
            </Link>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground pt-8">
          &copy; 2024 Deal Intelligence Inc. All rights reserved.
        </p>
      </div>
    </div>
  );
}

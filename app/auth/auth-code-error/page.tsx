import { Button } from "@/components/ui/Button";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

export default function AuthCodeError() {
    return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-background p-4">
            <div className="flex flex-col items-center space-y-6 text-center max-w-md">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                    <AlertCircle className="h-8 w-8" />
                </div>

                <h1 className="text-2xl font-bold tracking-tight">Authentication Error</h1>

                <p className="text-muted-foreground">
                    There was an issue signing you in. The login link may have expired or is invalid. Please try logging in again.
                </p>

                <Button asChild className="mt-4">
                    <Link href="/">Back to Login</Link>
                </Button>
            </div>
        </div>
    );
}

import Link from "next/link";
import { Button } from "@/components/ui/Button";

export default function NotFound() {
    return (
        <div className="flex h-screen w-full flex-col items-center justify-center bg-background p-4">
            <div className="flex flex-col items-center space-y-6 text-center max-w-lg">
                <h1 className="text-6xl font-bold">404</h1>
                <h2 className="text-2xl font-semibold">Page Not Found</h2>
                <p className="text-muted-foreground">
                    The page you're looking for doesn't exist or has been moved.
                </p>
                <Button asChild>
                    <Link href="/">Go Home</Link>
                </Button>
            </div>
        </div>
    );
}

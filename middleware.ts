import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
    const { response, user } = await updateSession(request);

    // Helper for creating redirects while preserving updated session cookies
    const createRedirect = (path: string) => {
        const redirectUrl = new URL(path, request.url);
        const redirectResponse = NextResponse.redirect(redirectUrl);

        // Copy cookies from updateSession response (which may contain refreshed auth tokens)
        response.cookies.getAll().forEach((cookie) => {
            redirectResponse.cookies.set(cookie);
        });

        return redirectResponse;
    };

    // Authenticated users visiting the landing page or login URL should go to projects
    if (user && request.nextUrl.pathname === "/") {
        return createRedirect("/projects");
    }

    // Define protected routes (add/remove as needed)
    const protectedRoutes = ["/dashboard", "/projects", "/admin", "/analytics"];

    // Check if current path matches any protected route
    const isProtectedRoute = protectedRoutes.some(route =>
        request.nextUrl.pathname.startsWith(route)
    );

    // Unauthenticated users trying to access protected routes go to login
    if (!user && isProtectedRoute) {
        return createRedirect("/");
    }

    return response;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * Feel free to modify this pattern to include more paths.
         */
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};

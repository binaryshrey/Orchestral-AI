// middleware.ts
import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

export default authkitMiddleware();

// Configure which routes the middleware runs on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - sign-in and sign-up routes (auth routes)
     * - callback route
     */
    "/((?!_next/static|_next/image|favicon.ico|sign-in|sign-up|callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};

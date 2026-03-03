import NextAuth from "next-auth";
import authConfig from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

const ADMIN_DOMAIN = "@navomarine.com";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const email = req.auth?.user?.email ?? "";
  const { pathname } = req.nextUrl;

  const isAdminPath = pathname.startsWith("/admin") && pathname !== "/admin/unauthorized";
  const isDashboardPath = pathname.startsWith("/dashboard");

  if ((isDashboardPath || isAdminPath) && !isLoggedIn) {
    return Response.redirect(new URL("/login", req.nextUrl));
  }

  if (isAdminPath && isLoggedIn && !email.endsWith(ADMIN_DOMAIN)) {
    return Response.redirect(new URL("/admin/unauthorized", req.nextUrl));
  }
});

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};

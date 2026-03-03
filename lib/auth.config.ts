import Google from "next-auth/providers/google";
import type { NextAuthConfig } from "next-auth";

/**
 * Edge-compatible auth config (no database adapter).
 * Used by middleware for route protection.
 * JWT strategy required: middleware has no DB access, so both sides must agree
 * on session format. Prisma adapter still stores User/Account; Session table unused.
 */
export default {
  providers: [Google],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
} satisfies NextAuthConfig;

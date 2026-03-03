import Google from "next-auth/providers/google";
import type { NextAuthConfig } from "next-auth";

/**
 * Edge-compatible auth config (no database adapter).
 * Used by middleware for route protection.
 */
export default {
  providers: [Google],
  pages: {
    signIn: "/login",
  },
} satisfies NextAuthConfig;

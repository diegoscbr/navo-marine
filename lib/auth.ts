import NextAuth from "next-auth";
import authConfig from "./auth.config";

// NOTE: Prisma adapter removed temporarily — no hosted DB configured yet.
// Sessions are JWT-only (stateless). To restore persistence, add a hosted DB
// (e.g. Neon/Supabase for Postgres or Turso for SQLite), update DATABASE_URL
// in Vercel env vars, and re-add PrismaAdapter here.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    session({ session, token }) {
      if (token?.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});

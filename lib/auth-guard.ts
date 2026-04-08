import { auth } from "./auth";

const ADMIN_DOMAIN = '@navomarine.com'

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return session;
}

export async function requireAdmin(): Promise<{ ok: true } | { ok: false }> {
  const session = await auth();
  if (!session?.user?.email?.endsWith(ADMIN_DOMAIN)) {
    return { ok: false };
  }
  return { ok: true };
}

/**
 * Returns the authenticated admin session, or null if not admin.
 * Use in API route handlers: `const session = await requireAdminSession(); if (!session) return unauthorized()`
 */
export async function requireAdminSession() {
  const session = await auth();
  if (!session?.user?.email?.endsWith(ADMIN_DOMAIN)) return null;
  return session;
}

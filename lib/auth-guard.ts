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

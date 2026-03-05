import { auth } from "./auth";

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return session;
}

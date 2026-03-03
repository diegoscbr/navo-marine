import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Admin | NAVO Marine Technologies",
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  return (
    <div className="flex min-h-screen bg-navy-900 text-white">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col border-r border-white/10 bg-navy-800">
        <div className="border-b border-white/10 px-5 py-5">
          <span className="text-xs font-semibold uppercase tracking-widest text-white/40">
            NAVO Admin
          </span>
        </div>

        <nav className="flex flex-1 flex-col gap-1 p-3">
          <Link
            href="/admin/products"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-white/70 transition-colors hover:bg-white/5 hover:text-white"
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
            Products
          </Link>
        </nav>

        <div className="border-t border-white/10 px-4 py-4">
          <p className="truncate text-xs text-white/30">{session?.user?.email}</p>
          <Link href="/dashboard" className="mt-1 block text-xs text-white/40 hover:text-white/70">
            ← Back to site
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}

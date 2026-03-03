import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-navy-900 px-6 text-center">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-10 backdrop-blur-sm">
        <p className="text-5xl font-bold text-marine-500">403</p>
        <h1 className="mt-4 text-xl font-semibold text-white">Access restricted</h1>
        <p className="mt-2 text-sm text-white/40">
          The admin panel requires a <span className="text-white/60">@navomarine.com</span> account.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block rounded-lg bg-marine-500/10 px-5 py-2 text-sm font-medium text-marine-400 hover:bg-marine-500/20"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}

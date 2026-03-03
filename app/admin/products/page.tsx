import type { Metadata } from "next";
import Link from "next/link";
import { listProducts } from "@/lib/db/products";

export const metadata: Metadata = {
  title: "Products | NAVO Admin",
};

const STATUS_STYLES: Record<string, string> = {
  active: "bg-emerald-500/15 text-emerald-400",
  draft: "bg-yellow-500/15 text-yellow-400",
  archived: "bg-white/10 text-white/40",
};

function cents(n: number) {
  return `$${(n / 100).toFixed(2)}`;
}

export default async function AdminProductsPage() {
  const products = await listProducts();

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Products</h1>
          <p className="mt-1 text-sm text-white/40">{products.length} product{products.length !== 1 ? "s" : ""}</p>
        </div>
        <Link
          href="/admin/products/new"
          className="flex items-center gap-2 rounded-lg bg-marine-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-marine-400"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add product
        </Link>
      </div>

      {/* Table */}
      {products.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 py-16 text-center">
          <p className="text-sm text-white/40">No products yet.</p>
          <Link href="/admin/products/new" className="mt-3 inline-block text-sm text-marine-400 hover:underline">
            Create your first product →
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/5 text-left text-xs font-medium uppercase tracking-wider text-white/40">
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Price</th>
                <th className="px-5 py-3">Rental</th>
                <th className="px-5 py-3">Options</th>
                <th className="px-5 py-3">Add-ons</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {products.map((p) => (
                <tr key={p.id} className="bg-white/[0.02] transition-colors hover:bg-white/5">
                  <td className="px-5 py-4">
                    <p className="font-medium text-white">{p.name}</p>
                    <p className="mt-0.5 text-xs text-white/30">{p.slug}</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[p.status] ?? STATUS_STYLES.draft}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-white/70">{cents(p.priceCents)}</td>
                  <td className="px-5 py-4">
                    {p.rentalEnabled ? (
                      <span className="text-cyan-400">{cents(p.rentalPriceCents ?? 0)}/day</span>
                    ) : (
                      <span className="text-white/30">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-white/50">{p.options.length}</td>
                  <td className="px-5 py-4 text-white/50">{p.addOns.length}</td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={`/admin/products/${p.id}/edit`}
                      className="text-xs text-marine-400 hover:text-marine-300 hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

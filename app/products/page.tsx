import type { Metadata } from 'next'
import Link from 'next/link'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { storefrontProducts } from '@/lib/commerce/products'

function formatUSD(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

export const metadata: Metadata = {
  title: 'Products | NAVO Marine Technologies',
  description: 'Explore NAVO Marine Technologies product offerings.',
}

export default function ProductsPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-7xl px-6 pb-20 pt-28">
        <h1 className="font-heading text-4xl font-semibold text-white">Products</h1>
        <p className="mt-3 max-w-2xl text-white/60">
          Performance hardware and instrumentation for competitive sailing teams.
        </p>

        <div className="mt-10 grid gap-5">
          {storefrontProducts.map((product) => (
            <article
              key={product.id}
              className="max-w-2xl rounded-xl border border-white/10 bg-navy-800/60 p-8"
            >
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-glow">Product</p>
              <h2 className="font-heading mt-2 text-2xl font-semibold text-white">{product.name}</h2>
              <p className="mt-2 text-sm text-white/70">{product.descriptionShort}</p>
              <p className="mt-4 text-lg font-medium text-white">{formatUSD(product.pricing.amountCents)}</p>
              <Link
                href={`/products/${product.slug}`}
                className="mt-6 inline-flex rounded-full border border-white/20 px-5 py-2.5 text-sm text-white/85 transition-colors hover:border-white/40 hover:text-white"
              >
                View Product
              </Link>
            </article>
          ))}
        </div>
      </main>
      <Footer />
    </>
  )
}

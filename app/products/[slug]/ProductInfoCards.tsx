'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import type { StorefrontProduct } from '@/lib/commerce/types'

function formatUSD(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

type ProductInfoCardsProps = {
  product: StorefrontProduct
  warranty: StorefrontProduct['addOns'][number] | null
}

const cards = [
  { key: 'box', label: 'In the Box' },
  { key: 'warranty', label: 'Warranty' },
  { key: 'rental', label: 'Rental' },
  { key: 'support', label: 'Support' },
] as const

export function ProductInfoCards({ product, warranty }: ProductInfoCardsProps) {
  const contents: Record<string, React.ReactNode> = {
    box: product.inTheBox.join(', '),
    warranty: `Optional Vakaros Care at ${formatUSD(warranty?.priceCents ?? 0)}.`,
    rental: `Event rentals start at ${formatUSD(product.rentalPolicy?.rentalPriceCents ?? 0)} with sail number capture.`,
    support: (
      <>
        User manual and setup resources are available at{' '}
        <Link
          href={product.support.manualUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center text-marine-400 underline-offset-4 hover:underline"
        >
          support.vakaros.com
        </Link>
        .
      </>
    ),
  }

  return (
    <section className="border-t border-white/5 py-16">
      <div className="mx-auto grid max-w-7xl gap-5 px-6 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, i) => (
          <motion.article
            key={card.key}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.08 }}
            className="rounded-xl border border-white/10 bg-navy-800/60 p-5"
          >
            <p className="text-xs uppercase tracking-[0.17em] text-white/40">{card.label}</p>
            <p className="mt-3 text-sm leading-relaxed text-white/65">{contents[card.key]}</p>
          </motion.article>
        ))}
      </div>
    </section>
  )
}

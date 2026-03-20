import type { PackageProduct } from '@/lib/db/packages'
import Image from 'next/image'

type Props = {
  products: PackageProduct[]
  onSelect: (product: PackageProduct) => void
}

const PACKAGE_META: Record<string, { image: string; description: string; equipment: string[] }> = {
  'race-committee-package': {
    image: '/racecomittee.jpg',
    description: 'Essential tablet tools for race committee operations at any regatta.',
    equipment: ['1× Committee Tablet'],
  },
  'rc-wl-course-package': {
    image: '/windward-leeward.jpg',
    description: 'Full Atlas 2 fleet deployment for windward-leeward course management.',
    equipment: ['5× Atlas 2 Units', '1× Committee Tablet'],
  },
  'racesense-management-services': {
    image: '/racemanagement.jpg',
    description: 'Human-led race orchestration with full data platform. Expenses invoiced separately.',
    equipment: ['Dedicated Race Director', 'Full Data Platform'],
  },
}

export function PackageCards({ products, onSelect }: Props) {
  return (
    <div className="grid gap-6 md:grid-cols-3">
      {products.map((product) => {
        const meta = PACKAGE_META[product.slug] ?? { image: '', description: '', equipment: [] }
        const isHold = product.payment_mode === 'hold'

        return (
          <button
            key={product.id}
            onClick={() => onSelect(product)}
            className="group text-left rounded-xl border border-white/10 bg-white/5 p-6 hover:border-marine-500/50 hover:bg-white/8 transition-all"
          >
            {meta.image && (
              <div className="relative h-40 w-full overflow-hidden rounded-t-xl -mx-6 -mt-6 mb-6">
                <Image src={meta.image} alt={product.name} fill className="object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-navy-900 via-navy-900/60 to-transparent" />
              </div>
            )}
            <h3 className="font-heading text-lg font-semibold text-white mb-1">{product.name}</h3>

            {product.min_advance_booking_days && (
              <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400 border border-amber-500/30 mb-2">
                {product.min_advance_booking_days}-day advance required
              </span>
            )}

            <p className="text-2xl font-bold text-marine-500 mb-3">
              {`$${(product.price_per_day_cents / 100).toFixed(0)}`}<span className="text-sm font-normal text-white/50">/day</span>
            </p>
            <p className="text-sm text-white/60 mb-4">{meta.description}</p>

            <ul className="space-y-1 mb-4">
              {meta.equipment.map((item) => (
                <li key={item} className="text-xs text-white/50 flex items-center gap-1">
                  <span className="text-marine-500">✓</span> {item}
                </li>
              ))}
            </ul>

            {isHold && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                <strong>Payment hold</strong> — expenses invoiced separately after the event.
              </div>
            )}

            <div className="mt-4 text-sm font-medium text-marine-500 group-hover:text-cyan-glow transition-colors">
              Select →
            </div>
          </button>
        )
      })}
    </div>
  )
}

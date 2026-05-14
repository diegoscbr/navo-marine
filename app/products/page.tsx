import type { Metadata } from 'next'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { listStorefrontProducts } from '@/lib/db/storefront'
import type { StorefrontProduct } from '@/lib/commerce/types'
import { ProductSpotlight } from './ProductSpotlight'
import { ProductTile } from './ProductTile'

export const metadata: Metadata = {
  title: 'Products | NAVO Marine Technologies',
  description:
    'Race-grade instrumentation and full-service race management. Vakaros Atlas 2, Race Committee tablet packages, windward-leeward course deployments, and RaceSense management services.',
  openGraph: {
    title: 'Products | NAVO Marine Technologies',
    description:
      'Race-grade instrumentation and full-service race management for competitive sailing teams.',
    images: ['/products/atlas2/basic.png'],
  },
}

type ProductDisplay = {
  eyebrow: string
  eyebrowLogo?: string
  eyebrowLogoAlt?: string
  tagline: string
  description: string
  bullets: string[]
  image: string
  imageAlt: string
  accentImage?: string
  accentImageAlt?: string
  primaryHref: string
  primaryLabel: string
  secondaryHref?: string
  secondaryLabel?: string
  spotlight?: boolean
  order: number
}

const PRODUCT_DISPLAY: Record<string, ProductDisplay> = {
  'atlas-2': {
    eyebrow: 'Vakaros Atlas 2',
    eyebrowLogo: '/partners/2.png',
    eyebrowLogoAlt: 'Vakaros',
    tagline: 'The Future of Sailing Technology.',
    description:
      'Centimeter-accurate GNSS, an intelligent compass, and start-line guidance — engineered for the fastest decisions on the water.',
    bullets: [
      'Dual-band L1 + L5 GNSS positioning',
      'Start, compass, and lift/header modes',
      'Pairs with the Vakaros mobile app',
    ],
    image: '/products/atlas2/basic.png',
    imageAlt: 'Vakaros Atlas 2 sailing instrument display showing start mode',
    accentImage: '/products/atlas2/iphone-mock-1.png',
    accentImageAlt: 'Vakaros mobile app screen paired with Atlas 2',
    primaryHref: '/products/atlas-2',
    primaryLabel: 'Learn more',
    secondaryHref: '/reserve',
    secondaryLabel: 'Reserve a unit',
    spotlight: true,
    order: 0,
  },
  'race-committee-package': {
    eyebrow: 'Race Committee',
    tagline: 'Essential tablet tools for any regatta.',
    description:
      'A pre-configured committee tablet with the software your signal boat actually needs — ready to deploy the moment it arrives.',
    bullets: [
      '1× Committee tablet, pre-configured',
      'Capacity for up to 3 concurrent events',
      'Onboarding and remote support included',
    ],
    image: '/rc-standard.jpg',
    imageAlt: 'Race committee operating from the signal boat with a tablet',
    primaryHref: '/packages',
    primaryLabel: 'Book package',
    secondaryHref: '/packages',
    secondaryLabel: 'See what’s included',
    order: 1,
  },
  'rc-wl-course-package': {
    eyebrow: 'Windward / Leeward',
    tagline: 'Full Atlas 2 deployment for course management.',
    description:
      'A complete instrumented course — Atlas 2 units, a committee tablet, and setup support — purpose-built for windward-leeward racing.',
    bullets: [
      '5× Atlas 2 units + 1× Committee tablet',
      'Optimized for W/L course racing',
      'Pre-event setup and on-call support',
    ],
    image: '/windward-leeward-new.jpg',
    imageAlt: 'Windward / leeward course with sailboats rounding under spinnaker',
    primaryHref: '/packages',
    primaryLabel: 'Book package',
    secondaryHref: '/packages',
    secondaryLabel: 'See what’s included',
    order: 2,
  },
  'racesense-management-services': {
    eyebrow: 'Full-service',
    tagline: 'Human-led race orchestration, end to end.',
    description:
      'A dedicated race director and full data platform on-site, so your club can focus on the racing instead of the logistics.',
    bullets: [
      'Dedicated race director on-site',
      'Full data platform during the event',
      'Expenses invoiced separately after the event',
    ],
    image: '/race-management-official.jpg',
    imageAlt: 'NAVO race management team coordinating a regatta on the water',
    primaryHref: '/packages',
    primaryLabel: 'Request a quote',
    secondaryHref: '/contact',
    secondaryLabel: 'Talk to our team',
    order: 3,
  },
}

function formatPrice(product: StorefrontProduct, display: ProductDisplay): string {
  const usd = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })
  const amount = usd.format(product.pricing.amountCents / 100)
  // Atlas 2 is a one-time purchase; packages are day-rate rentals.
  if (display.order === 0) return `From ${amount}`
  return `${amount} / day`
}

export default async function ProductsPage() {
  const products = await listStorefrontProducts()
  const ordered = [...products]
    .map((p) => ({ product: p, display: PRODUCT_DISPLAY[p.slug] }))
    .filter((entry): entry is { product: StorefrontProduct; display: ProductDisplay } =>
      Boolean(entry.display),
    )
    .sort((a, b) => a.display.order - b.display.order)

  const spotlight = ordered.find((entry) => entry.display.spotlight)
  const tiles = ordered.filter((entry) => !entry.display.spotlight)

  return (
    <>
      <Navbar />
      <main className="bg-navy-900 pb-24">
        {spotlight && (
          <ProductSpotlight
            eyebrow={spotlight.display.eyebrow}
            eyebrowLogo={spotlight.display.eyebrowLogo}
            eyebrowLogoAlt={spotlight.display.eyebrowLogoAlt}
            name={spotlight.product.name}
            tagline={spotlight.display.tagline}
            description={spotlight.display.description}
            priceLabel={formatPrice(spotlight.product, spotlight.display)}
            primaryHref={spotlight.display.primaryHref}
            primaryLabel={spotlight.display.primaryLabel}
            secondaryHref={spotlight.display.secondaryHref}
            secondaryLabel={spotlight.display.secondaryLabel}
            heroImage={spotlight.display.image}
            heroImageAlt={spotlight.display.imageAlt}
            accentImage={spotlight.display.accentImage}
            accentImageAlt={spotlight.display.accentImageAlt}
          />
        )}

        {tiles.length > 0 && (
          <section className="bg-navy-800/40 py-20 sm:py-24">
            <div className="mx-auto max-w-7xl px-6">
              <div className="mb-12 text-center">
                <p className="text-xs uppercase tracking-[0.28em] text-cyan-glow">
                  Race Management
                </p>
                <h2 className="font-heading mt-3 text-4xl font-semibold text-white sm:text-5xl">
                  Built for race officers.
                </h2>
                <p className="mx-auto mt-4 max-w-2xl text-base text-white/60">
                  From a single tablet on the signal boat to a full fleet of Vakaros units and regatta management
                  services, pick the package that matches your event.
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {tiles.map((entry, i) => (
                  <ProductTile
                    key={entry.product.id}
                    eyebrow={entry.display.eyebrow}
                    name={entry.product.name}
                    tagline={entry.display.tagline}
                    description={entry.display.description}
                    priceLabel={formatPrice(entry.product, entry.display)}
                    bullets={entry.display.bullets}
                    primaryHref={entry.display.primaryHref}
                    primaryLabel={entry.display.primaryLabel}
                    secondaryHref={entry.display.secondaryHref}
                    secondaryLabel={entry.display.secondaryLabel}
                    image={entry.display.image}
                    imageAlt={entry.display.imageAlt}
                    index={i}
                  />
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
      <Footer />
    </>
  )
}

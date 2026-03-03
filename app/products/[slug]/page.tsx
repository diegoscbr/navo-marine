import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { getProductBySlug } from '@/lib/commerce/products'
import { ProductPurchasePanel } from './ProductPurchasePanel'
import { ProductImageGallery } from './ProductImageGallery'
import { ProductInfoCards } from './ProductInfoCards'
import { ProductTechSpecs } from './ProductTechSpecs'

type ProductPageProps = {
  params: Promise<{ slug: string }>
}

function formatUSD(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

const productViewImages = [
  { src: '/products/atlas2/start-mode.png', alt: 'Atlas 2 start mode screen' },
  { src: '/products/atlas2/compass-mode.png', alt: 'Atlas 2 compass mode screen' },
  { src: '/products/atlas2/battery-charging.png', alt: 'Atlas 2 battery charging state' },
  { src: '/products/atlas2/iphone-mock-1.png', alt: 'Atlas 2 mobile app integration mockup' },
  { src: '/products/atlas2/iphone-mock-3.png', alt: 'Atlas 2 mobile app mode preview' },
  { src: '/products/atlas2/iphone-customizable.png', alt: 'Atlas 2 customizable phone interface' },
]

export async function generateStaticParams() {
  return [{ slug: 'atlas-2' }]
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params
  const product = getProductBySlug(slug)

  if (!product) {
    return {
      title: 'Product Not Found | NAVO Marine Technologies',
    }
  }

  return {
    title: `${product.name} | NAVO Marine Technologies`,
    description: product.descriptionShort,
  }
}

export default async function ProductDetailPage({ params }: ProductPageProps) {
  const { slug } = await params
  const product = getProductBySlug(slug)

  if (!product) {
    notFound()
  }

  const warranty = product.addOns.find((addon) => addon.slug === 'vakaros-care-warranty')

  return (
    <>
      <Navbar />
      <main className="bg-navy-900 pb-20">
        {/* Product hero */}
        <section className="relative overflow-hidden pt-28 pb-16">
          {/* Radial glow — matches the Hero section */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(30,110,255,0.1)_0%,transparent_70%)]" />
          {/* Subtle grid overlay */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(30,110,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(30,110,255,1) 1px, transparent 1px)',
              backgroundSize: '60px 60px',
            }}
          />

          <div className="relative z-10 mx-auto max-w-7xl px-6">
            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.24em] text-cyan-glow">Atlas 2</p>
              <h1 className="mt-4 text-5xl font-semibold leading-tight text-white sm:text-6xl">
                {product.name}
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-base text-white/60 sm:text-lg">
                {product.descriptionShort}
              </p>
              <p className="mt-4 text-sm text-white/40">
                Starting at {formatUSD(product.pricing.amountCents)} {product.pricing.taxIncluded && '· Tax included'}
              </p>
            </div>

            <div className="mt-12 grid gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
              <ProductImageGallery images={productViewImages} />
              <div className="lg:sticky lg:top-28 lg:self-start">
                <ProductPurchasePanel product={product} />
              </div>
            </div>
          </div>
        </section>

        {/* Info cards */}
        <ProductInfoCards product={product} warranty={warranty ?? null} />

        {/* Tech specs */}
        <ProductTechSpecs specGroups={product.techSpecs} />
      </main>
      <Footer />
    </>
  )
}

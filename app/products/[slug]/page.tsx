import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { getProductBySlug } from '@/lib/commerce/products'
import { ProductPurchasePanel } from './ProductPurchasePanel'
import { ProductImageGallery } from './ProductImageGallery'

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
      <main className="pb-20">
        <section className="bg-black pb-16 pt-28">
          <div className="mx-auto max-w-7xl px-6">
            <div className="text-center">
              <p className="text-xs uppercase tracking-[0.24em] text-cyan-glow">Atlas 2</p>
              <h1 className="mt-4 text-5xl font-semibold leading-tight text-white sm:text-6xl">
                {product.name}
              </h1>
              <p className="mx-auto mt-4 max-w-2xl text-base text-white/70 sm:text-lg">
                {product.descriptionShort}
              </p>
              <p className="mt-4 text-sm text-white/55">
                Starting at {formatUSD(product.pricing.amountCents)} {product.pricing.taxIncluded && '• Tax included'}
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

        <section className="bg-white py-16 text-[#1d1d1f]">
          <div className="mx-auto grid max-w-7xl gap-6 px-6 lg:grid-cols-4">
            <article className="rounded-3xl border border-black/10 bg-[#fafafc] p-5">
              <p className="text-xs uppercase tracking-[0.17em] text-black/45">In the Box</p>
              <p className="mt-3 text-sm text-black/75">{product.inTheBox.join(', ')}</p>
            </article>
            <article className="rounded-3xl border border-black/10 bg-[#fafafc] p-5">
              <p className="text-xs uppercase tracking-[0.17em] text-black/45">Warranty</p>
              <p className="mt-3 text-sm text-black/75">
                Optional Vakaros Care at {formatUSD(warranty?.priceCents ?? 0)}.
              </p>
            </article>
            <article className="rounded-3xl border border-black/10 bg-[#fafafc] p-5">
              <p className="text-xs uppercase tracking-[0.17em] text-black/45">Rental</p>
              <p className="mt-3 text-sm text-black/75">
                Event rentals start at {formatUSD(product.rentalPolicy?.rentalPriceCents ?? 0)} with
                sail number capture.
              </p>
            </article>
            <article className="rounded-3xl border border-black/10 bg-[#fafafc] p-5">
              <p className="text-xs uppercase tracking-[0.17em] text-black/45">Support</p>
              <p className="mt-3 text-sm text-black/75">
                User manual and setup resources are available at{' '}
                <Link
                  href={product.support.manualUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-marine-500 underline-offset-4 hover:underline"
                >
                  support.vakaros.com
                </Link>
                .
              </p>
            </article>
          </div>
        </section>

        <section className="bg-[#f5f5f7] py-20 text-[#1d1d1f]">
          <div className="mx-auto max-w-7xl px-6">
            <h2 className="text-3xl font-semibold sm:text-4xl">Tech Specs</h2>
            <div className="mt-8 space-y-5">
              {product.techSpecs.map((specGroup) => (
                <article key={specGroup.group} className="overflow-hidden rounded-3xl border border-black/10 bg-white">
                  <h3 className="border-b border-black/10 px-5 py-4 text-lg font-semibold">{specGroup.group}</h3>
                  <div>
                    {specGroup.rows.map((row) => (
                      <div
                        key={`${specGroup.group}-${row.label}`}
                        className="grid gap-2 border-b border-black/10 px-5 py-3 text-sm last:border-b-0 sm:grid-cols-[200px_1fr] sm:items-start"
                      >
                        <p className="text-black/55">{row.label}</p>
                        <p className="text-black/80">{row.value}</p>
                      </div>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

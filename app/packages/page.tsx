import type { Metadata } from 'next'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { listPackageProducts } from '@/lib/db/packages'
import { PackagesUI } from './PackagesUI'

export const metadata: Metadata = {
  title: 'Regatta Management Packages | NAVO Marine Technologies',
  description: 'Book race committee equipment and management services for your regatta.',
}

export default async function PackagesPage() {
  const products = await listPackageProducts()

  return (
    <>
      <Navbar />
      <main className="flex min-h-screen flex-col items-center bg-navy-900 px-6 pb-16 pt-28">
        <div className="w-full max-w-4xl text-center mb-10">
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Regatta Management Packages
          </h1>
          <p className="mt-4 text-lg text-white/70">
            Professional race committee equipment and management services, bookable by the day.
          </p>
        </div>
        <PackagesUI products={products} />
      </main>
      <Footer />
    </>
  )
}

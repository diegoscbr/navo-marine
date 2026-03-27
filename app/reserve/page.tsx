import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { listActiveRentalEvents, listActiveDateWindows } from '@/lib/db/events'
import { ReserveBookingUI } from './ReserveBookingUI'

export const metadata: Metadata = {
  title: 'Reserve Vakaros Atlas 2 | NAVO Marine Technologies',
  description: 'Book your Vakaros Atlas 2 rental for an upcoming event or custom dates.',
}

// The default product ID for Atlas 2 — seeded in Phase 1
const ATLAS2_PRODUCT_ID = process.env.ATLAS2_PRODUCT_ID ?? '6f303d86-5763-4ece-aaad-b78d17852f8a'

export default async function ReservePage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login?callbackUrl=/reserve')
  }

  const [events, windows] = await Promise.all([
    listActiveRentalEvents(),
    listActiveDateWindows(),
  ])

  return (
    <>
      <Navbar />
      <main className="flex min-h-screen flex-col items-center bg-navy-900 px-6 pb-16 pt-28">
        <div className="w-full max-w-3xl text-center mb-10">
          <h1 className="font-heading text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Reserve Vakaros Atlas 2
          </h1>
          <p className="mt-4 text-lg text-white/70">
            Choose an upcoming event or select custom dates. Secure your unit with a one-time rental fee.
          </p>
        </div>

        <ReserveBookingUI
          events={events}
          windows={windows}
          defaultProductId={ATLAS2_PRODUCT_ID}
        />
      </main>
      <Footer />
    </>
  )
}

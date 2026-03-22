import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'

export const metadata: Metadata = {
  title: 'Booking Confirmed | NAVO Marine Technologies',
}

export default async function CheckoutSuccessPage() {
  const session = await auth()

  if (!session?.user) {
    redirect('/login')
  }

  return (
    <div className="flex min-h-screen flex-col bg-navy-900">
      <Navbar />
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 p-10 backdrop-blur-sm">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-marine-500/20 text-marine-400">
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="font-heading text-2xl font-semibold text-white">
            Booking Confirmed
          </h1>
          <p className="mt-3 text-sm text-white/60">
            Your reservation is being processed. You&apos;ll receive a confirmation email shortly at{' '}
            <span className="text-white/80">{session.user.email}</span>.
          </p>
          <p className="mt-2 text-sm text-white/40">
            Questions? Reach us at{' '}
            <a href="mailto:info@navomarine.com" className="text-marine-400 hover:underline">
              info@navomarine.com
            </a>{' '}
            or 619-288-9746.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <Link href="/" className="glass-btn glass-btn-primary px-6 py-3 text-sm font-medium">
              Back to Home
            </Link>
            <Link href="/reserve" className="glass-btn glass-btn-ghost px-6 py-3 text-sm font-medium">
              Make Another Booking
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}

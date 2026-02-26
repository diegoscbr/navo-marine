'use client'

import Image from 'next/image'
import { ReserveCalendlyInline } from '@/components/ui/ReserveCalendlyInline'

export function ReserveForm() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-navy-900 px-6 pb-16 pt-28 text-center">
      <Image
        src="/logos/transparent_background_logo.png"
        alt="NAVO Marine Technologies"
        width={140}
        height={38}
        className="mb-12"
      />

      <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
        Reserve Vakaros Atlas II Units
      </h1>

      <p className="mt-4 text-lg text-white/50">
        Book a reservation consultation to secure your Atlas 2 units.
      </p>

      <ReserveCalendlyInline />
    </main>
  )
}

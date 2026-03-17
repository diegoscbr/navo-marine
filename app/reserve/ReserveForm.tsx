'use client'

import { ReserveCalendlyInline } from '@/components/ui/ReserveCalendlyInline'

export function ReserveForm() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-navy-900 px-6 pb-16 pt-28">
      <div className="w-full max-w-3xl text-center">
        <h1 className="font-heading text-4xl font-semibold tracking-tight text-white sm:text-5xl">
          Reserve Vakaros Atlas II Units
        </h1>

        <p className="mt-4 text-lg text-white/70">
          Book a 30-minute consultation to configure your order and secure your units.
        </p>

        <p className="mt-2 text-sm text-white/40">
          You&apos;ll speak directly with the NAVO team. We&apos;ll discuss your race program, unit count, and delivery timeline.
        </p>
      </div>

      <ReserveCalendlyInline />
    </main>
  )
}

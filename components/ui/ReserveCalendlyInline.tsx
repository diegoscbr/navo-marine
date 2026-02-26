'use client'

import { useEffect, useRef } from 'react'
import { CALENDLY_RESERVE_URL, ensureCalendlyAssets, withCalendlyTracking } from '@/lib/calendly'

export function ReserveCalendlyInline() {
  const inlineWidgetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (inlineWidgetRef.current) {
      inlineWidgetRef.current.setAttribute('data-url', withCalendlyTracking(CALENDLY_RESERVE_URL))
    }
    void ensureCalendlyAssets()
  }, [])

  return (
    <div className="mt-10 w-full max-w-5xl">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-2">
        <div
          ref={inlineWidgetRef}
          className="calendly-inline-widget h-[760px] w-full min-w-[320px]"
          data-url={CALENDLY_RESERVE_URL}
        />
      </div>
      <p className="mt-4 text-sm text-white/50">
        If the scheduler does not load,{' '}
        <a
          href={CALENDLY_RESERVE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-marine-400 underline decoration-marine-400/40 underline-offset-4"
        >
          open Calendly in a new tab
        </a>
        .
      </p>
    </div>
  )
}

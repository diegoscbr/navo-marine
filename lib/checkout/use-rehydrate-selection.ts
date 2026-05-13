'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { decodeSelection, type Selection } from './state-codec'

/**
 * Reads the current URL's query string once on mount, attempts to decode a
 * `Selection`, and invokes `apply` with the result if decoding succeeds.
 * No-op when the URL has no decodable selection.
 *
 * Used by ReserveBookingUI, PackagesUI, and ProductPurchasePanel to
 * rehydrate their form state after returning from /login.
 */
export function useRehydrateSelection(apply: (selection: Selection) => void): void {
  const searchParams = useSearchParams()

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    const selection = decodeSelection(params)
    if (selection) apply(selection)
    // intentional: run exactly once on mount, snapshot of URL at that moment
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

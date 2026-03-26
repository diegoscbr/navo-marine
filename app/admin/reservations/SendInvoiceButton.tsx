'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  reservationId: string
  customerEmail: string
  totalCents: number
  productName: string
}

function formatUSD(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

export function SendInvoiceButton({
  reservationId,
  customerEmail,
  totalCents,
  productName,
}: Props) {
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSend() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/reservations/${reservationId}/send-invoice`, {
        method: 'POST',
      })
      if (!res.ok) {
        const body = await res.json()
        setError(body.error ?? 'Failed to send invoice')
        return
      }
      setSent(true)
      setTimeout(() => {
        setShowConfirm(false)
        setSent(false)
        router.refresh()
      }, 1500)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => { setShowConfirm(true); setError(null); setSent(false) }}
        aria-label="Send invoice"
        className="rounded p-1 text-white/30 transition-colors hover:bg-blue-500/20 hover:text-blue-400"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
          <path d="M19 8.839l-7.616 3.808a2.75 2.75 0 01-2.768 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
        </svg>
      </button>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-white/10 bg-navy-900 p-6 shadow-2xl">
            <h3 className="font-heading text-base font-semibold text-white">
              Send Payment Invoice
            </h3>
            <p className="mt-2 text-sm text-white/60">
              Send a Stripe payment link to{' '}
              <span className="text-white/80">{customerEmail}</span>{' '}
              for{' '}
              <span className="text-white/80">{formatUSD(totalCents)}</span>{' '}
              (<span className="text-white/80">{productName}</span>)?
            </p>
            <p className="mt-1 text-xs text-white/40">
              The customer will receive an email with a payment link that expires in 24 hours.
            </p>

            {error && (
              <p className="mt-3 text-sm text-red-400">{error}</p>
            )}

            {sent ? (
              <p className="mt-4 text-sm font-medium text-green-400">Invoice sent!</p>
            ) : (
              <div className="mt-5 flex gap-3">
                <button
                  onClick={handleSend}
                  disabled={loading}
                  aria-label="Confirm send invoice"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
                >
                  {loading ? 'Sending...' : 'Send Invoice'}
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  aria-label="Cancel"
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/60 transition-colors hover:text-white"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

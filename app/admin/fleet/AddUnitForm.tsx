'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Product = { id: string; name: string }
type Props = { products: Product[] }

export function AddUnitForm({ products }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [navoNumber, setNavoNumber] = useState('')
  const [serialNumber, setSerialNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [productId, setProductId] = useState(products[0]?.id ?? '')
  const [error, setError] = useState('')

  const fieldClass =
    'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/30 focus:border-marine-500 focus:outline-none'

  function reset() {
    setNavoNumber('')
    setSerialNumber('')
    setNotes('')
    setError('')
    setOpen(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const res = await fetch('/api/admin/units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          navo_number: navoNumber,
          product_id: productId,
          serial_number: serialNumber || undefined,
          notes: notes || undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError((json as { error?: string }).error ?? 'Failed to add unit.')
        return
      }
      reset()
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-marine-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-marine-400"
      >
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        Add unit
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
      <h3 className="mb-4 text-sm font-semibold text-white">Add unit</h3>
      <div className="grid grid-cols-2 gap-3">
        {products.length > 1 && (
          <div className="col-span-2">
            <label className="mb-1 block text-xs text-white/40">Product *</label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className={fieldClass}
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs text-white/40">Unit number *</label>
          <input
            required
            value={navoNumber}
            onChange={(e) => setNavoNumber(e.target.value)}
            className={fieldClass}
            placeholder="NAVO-041"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-white/40">Serial number</label>
          <input
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            className={fieldClass}
            placeholder="Optional"
          />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-xs text-white/40">Notes</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={fieldClass}
            placeholder="Optional"
          />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      <div className="mt-4 flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-marine-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {isPending ? 'Adding…' : 'Add unit'}
        </button>
        <button
          type="button"
          onClick={reset}
          className="text-sm text-white/40 hover:text-white/70"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

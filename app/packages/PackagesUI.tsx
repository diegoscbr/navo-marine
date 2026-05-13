'use client'

import { useState } from 'react'
import type { PackageProduct } from '@/lib/db/packages'
import { useRehydrateSelection } from '@/lib/checkout/use-rehydrate-selection'
import { PackageCards } from './PackageCards'
import { DateRangePicker } from './DateRangePicker'
import { PackageReviewStep } from './PackageReviewStep'

type Step = 1 | 2 | 3

type Props = {
  products: PackageProduct[]
}

export function PackagesUI({ products }: Props) {
  const [step, setStep] = useState<Step>(1)
  const [selectedProduct, setSelectedProduct] = useState<PackageProduct | null>(null)
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  useRehydrateSelection((selection) => {
    if (selection.reservation_type !== 'regatta_package') return
    const product = products.find((p) => p.id === selection.product_id)
    if (!product) return
    setSelectedProduct(product)
    setStartDate(selection.start_date)
    setEndDate(selection.end_date)
    setStep(3)
  })

  if (products.length === 0) {
    return (
      <div className="text-center text-white/50 py-20">
        No packages available at this time.
      </div>
    )
  }

  return (
    <div className="w-full max-w-4xl">
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-4 mb-10">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                step === s
                  ? 'bg-marine-500 text-white'
                  : step > s
                  ? 'bg-marine-500/40 text-white/70'
                  : 'bg-white/10 text-white/30'
              }`}
            >
              {s}
            </div>
            {s < 3 && <div className={`h-px w-8 ${step > s ? 'bg-marine-500/40' : 'bg-white/10'}`} />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <PackageCards
          products={products}
          onSelect={(product) => {
            setSelectedProduct(product)
            setStep(2)
          }}
        />
      )}

      {step === 2 && selectedProduct && (
        <DateRangePicker
          product={selectedProduct}
          onNext={(start, end) => {
            setStartDate(start)
            setEndDate(end)
            setStep(3)
          }}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && selectedProduct && startDate && endDate && (
        <PackageReviewStep
          product={selectedProduct}
          startDate={startDate}
          endDate={endDate}
          onBack={() => setStep(2)}
        />
      )}
    </div>
  )
}

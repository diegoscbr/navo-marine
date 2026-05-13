import type { OrderSummary as OrderSummaryShape } from '@/lib/checkout/summary'

function formatUSD(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

export function OrderSummary({ summary }: { summary: OrderSummaryShape }) {
  return (
    <div
      data-testid="order-summary"
      className="w-full max-w-sm rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-md"
    >
      <p className="text-xs uppercase tracking-[0.22em] text-white/40">{summary.contextLabel}</p>
      <ul className="mt-3 space-y-1.5">
        {summary.lineItems.map((item, idx) => (
          <li key={idx} className="text-sm text-white/80">
            {item.label}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-sm">
        <span className="text-white/60">Total</span>
        <span className="font-semibold text-white">{formatUSD(summary.totalCents)}</span>
      </div>
    </div>
  )
}

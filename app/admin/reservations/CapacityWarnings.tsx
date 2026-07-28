import type { EventSubscription } from '@/lib/db/fleet'

/**
 * Advisory strip showing where bookings run ahead of the fleet.
 *
 * Deliberately a warning and not a gate. Taking more bookings than units is
 * normal here — devices get allocated before the event — so this exists to make
 * the gap visible, not to stop anything. Checkout only fails when every
 * serviceable unit is already assigned.
 */
export function CapacityWarnings({ subscriptions }: { subscriptions: EventSubscription[] }) {
  const flagged = subscriptions.filter(s => s.nearCapacity || s.oversubscribed)

  if (flagged.length === 0) return null

  return (
    <section aria-labelledby="capacity-warnings-heading" className="mb-8">
      <h2 id="capacity-warnings-heading" className="mb-3 text-xs font-medium uppercase tracking-wider text-white/40">
        Fleet pressure
      </h2>

      <ul className="flex flex-col gap-2">
        {flagged.map(s => {
          const over = s.oversubscribed
          const tone = over
            ? 'border-red-500/30 bg-red-500/5'
            : 'border-amber-500/30 bg-amber-500/5'
          const textTone = over ? 'text-red-300' : 'text-amber-300'

          return (
            <li
              key={`${s.eventId}-${s.productId}`}
              className={`rounded-md border px-4 py-3 ${tone}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-sm font-medium text-white">
                  {s.eventName}
                  <span className="ml-2 font-normal text-white/40">{s.productName}</span>
                </p>
                <p className={`text-sm font-semibold tabular-nums ${textTone}`}>
                  {s.booked} booked / {s.capacity} units
                  <span className="ml-2 font-normal">({s.subscriptionPct}%)</span>
                </p>
              </div>

              <p className="mt-1 text-xs text-white/50">
                {over ? (
                  <>
                    Over-subscribed by {s.booked - s.capacity}. Bookings still go through —
                    only assigned units limit checkout, and {s.remaining} of {s.capacity} are
                    unassigned.
                  </>
                ) : (
                  <>
                    Approaching fleet size. {s.remaining} of {s.capacity} units still
                    unassigned.
                  </>
                )}
                {s.assigned > 0 && <> {s.assigned} already allocated.</>}
              </p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

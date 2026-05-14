'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { SectionHeader } from '@/components/ui/SectionHeader'
import type { RentalEvent } from '@/lib/db/events'
import { formatDateRange } from '@/lib/utils/dates'

const MAX_EVENTS = 6

interface UpcomingEventsPreviewProps {
  events: RentalEvent[]
}

export function UpcomingEventsPreview({ events }: UpcomingEventsPreviewProps) {
  if (events.length === 0) return null
  const shown = events.slice(0, MAX_EVENTS)

  return (
    <section className="bg-navy-900 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader heading="Where we’re racing next." />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((event, i) => (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              className="flex flex-col rounded-xl border border-white/10 bg-navy-800/60 p-6"
            >
              <h3 className="font-heading text-lg font-semibold text-white">{event.name}</h3>
              <p className="mt-2 text-sm text-marine-400">
                {formatDateRange(event.start_date, event.end_date)}
              </p>
              {event.location && (
                <p className="mt-1 text-sm text-white/60">{event.location}</p>
              )}
              <div className="mt-auto flex flex-wrap gap-3 pt-6">
                <Link
                  href={`/reserve?selected_event=${event.id}`}
                  className="glass-btn glass-btn-primary inline-flex items-center justify-center px-5 py-2 text-sm font-medium tracking-wide"
                >
                  Reserve
                </Link>
                {event.event_url && (
                  <a
                    href={event.event_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-sm text-white/70 underline-offset-4 hover:underline"
                  >
                    Event info ↗
                  </a>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { pastEvents } from '@/lib/content/about'

export function PastEventsGrid() {
  return (
    <section className="bg-navy-800/40 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader heading="Recently in action." />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {pastEvents.map((event, i) => (
            <motion.div
              key={event.slug}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              className="overflow-hidden rounded-xl border border-white/10 bg-navy-900"
            >
              <div className="relative aspect-[4/3] w-full">
                <Image
                  src={event.image}
                  alt={event.name}
                  fill
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover"
                />
              </div>
              <div className="p-5">
                <h3 className="font-heading text-base font-semibold text-white">{event.name}</h3>
                <p className="mt-1 text-sm text-marine-400">{event.date_label}</p>
                <p className="mt-0.5 text-sm text-white/60">{event.location}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

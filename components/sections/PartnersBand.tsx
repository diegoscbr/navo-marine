'use client'

import Image from 'next/image'
import { motion } from 'framer-motion'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { partners } from '@/lib/content/about'

export function PartnersBand() {
  return (
    <section className="bg-navy-900 py-24">
      <div className="mx-auto max-w-5xl px-6">
        <SectionHeader heading="Partners." />
        <div className="grid grid-cols-1 items-center gap-12 sm:grid-cols-3">
          {partners.map((p, i) => (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="flex flex-col items-center gap-3"
            >
              <div className="relative h-16 w-40">
                <Image
                  src={p.logo}
                  alt={`${p.name} logo`}
                  fill
                  className="object-contain"
                  sizes="160px"
                />
              </div>
              {p.premier && (
                <span className="text-xs uppercase tracking-widest text-marine-400">
                  Premier Partner
                </span>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

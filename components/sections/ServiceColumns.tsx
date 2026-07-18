'use client'

import { motion } from 'framer-motion'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { serviceColumns } from '@/lib/content/about'

export function ServiceColumns() {
  return (
    <section className="bg-navy-900 py-24">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader heading="What we do." />
        <div className="grid gap-8 md:grid-cols-3">
          {serviceColumns.map((col, i) => (
            <motion.div
              key={col.title}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="rounded-xl border border-white/10 bg-navy-800/60 p-8"
            >
              <h3 className="font-heading mb-4 text-lg font-semibold text-white">{col.title}</h3>
              <p className="mb-6 text-sm leading-relaxed text-white/75">{col.body}</p>
              <ul className="space-y-2">
                {col.examples.map((ex) => (
                  <li key={ex} className="flex items-center gap-3 text-sm text-white/80">
                    <span className="h-1 w-4 rounded-full bg-marine-500" />
                    {ex}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

'use client'

import { motion } from 'framer-motion'
import { SectionHeader } from '@/components/ui/SectionHeader'

const capabilities = [
  {
    title: 'Event Architecture',
    description: 'Full regatta design — from course setting to schedule management.',
  },
  {
    title: 'On-Water Technology Systems',
    description: 'Integrated instrumentation, radio, and timing infrastructure.',
  },
  {
    title: 'Fleet Tracking',
    description: 'Real-time GPS fleet positioning for officials and spectators.',
  },
  {
    title: 'Compliance Systems',
    description: 'Protest management, finishing systems, and rules enforcement tools.',
  },
  {
    title: 'Live Spectator Data Feeds',
    description: 'Public-facing dashboards and broadcast-ready data pipelines.',
  },
]

export function RaceManagement() {
  return (
    <section id="race-management" className="py-24 bg-navy-800/40">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader
          heading="Elite Race Execution."
          subheading="Operational excellence meets marine innovation."
        />

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((cap, i) => (
            <motion.div
              key={cap.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="rounded-lg border border-white/10 bg-navy-900/80 p-6"
            >
              <h3 className="mb-2 font-semibold text-white">{cap.title}</h3>
              <p className="text-sm leading-relaxed text-white/50">{cap.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

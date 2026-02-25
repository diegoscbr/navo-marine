'use client'

import { motion } from 'framer-motion'
import { SectionHeader } from '@/components/ui/SectionHeader'

const capabilities = [
  {
    title: 'Performance Technology',
    description:
      'Official Vakaros Atlas II integration. Onboard systems optimization, instrumentation configuration, and athlete-level calibration.',
    items: ['Atlas II Integration', 'Systems Optimization', 'Instrumentation Config', 'Athlete Calibration'],
  },
  {
    title: 'Race Management Services',
    description:
      'End-to-end regatta execution. Live tracking, course analytics, data-enabled officiating, and fleet coordination systems.',
    items: ['Live Fleet Tracking', 'Course Analytics', 'Data-Enabled Officiating', 'Fleet Coordination'],
  },
  {
    title: 'Marine Data Intelligence',
    description:
      'Post-race analytics, performance modeling, and tactical breakdown with environmental condition integration.',
    items: ['Post-Race Analytics', 'Performance Modeling', 'Tactical Breakdown', 'Custom Dashboards'],
  },
]

export function CoreCapabilities() {
  return (
    <section id="capabilities" className="py-24 bg-navy-900">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader heading="Built for High-Performance Sailing." />

        <div className="grid gap-8 md:grid-cols-3">
          {capabilities.map((cap, i) => (
            <motion.div
              key={cap.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="rounded-xl border border-white/10 bg-navy-800/60 p-8"
            >
              <h3 className="mb-4 text-lg font-semibold text-white">{cap.title}</h3>
              <p className="mb-6 text-sm leading-relaxed text-white/60">{cap.description}</p>
              <ul className="space-y-2">
                {cap.items.map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-white/70">
                    <span className="h-1 w-4 rounded-full bg-marine-500" />
                    {item}
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

'use client'

import { motion } from 'framer-motion'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Button } from '@/components/ui/Button'

const dataPoints = [
  { label: 'High-Frequency GPS Telemetry', detail: '10Hz position + heading data' },
  { label: 'Wind, Current & Tactical Overlays', detail: 'Real-time environmental integration' },
  { label: 'Performance Benchmarking', detail: 'Fleet-relative speed indices' },
  { label: 'Historical Comparison Engine', detail: 'Race-over-race delta analysis' },
  { label: 'Live & Post-Event Data Pipelines', detail: 'Streaming and batch delivery' },
]

export function DataCapabilities() {
  return (
    <section id="data" className="py-24 bg-navy-800/40">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          <div>
            <SectionHeader
              heading="Advanced Data Infrastructure for Modern Racing."
              centered={false}
            />
            <ul className="space-y-6">
              {dataPoints.map((point, i) => (
                <motion.li
                  key={point.label}
                  initial={{ opacity: 0, x: -16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  className="flex gap-4"
                >
                  <span className="mt-1 h-5 w-5 flex-shrink-0 rounded-sm bg-marine-500/20 text-center text-xs font-bold leading-5 text-marine-400">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <p className="font-medium text-white">{point.label}</p>
                    <p className="mt-0.5 text-sm text-white/50">{point.detail}</p>
                  </div>
                </motion.li>
              ))}
            </ul>
            <div className="mt-10">
              <Button variant="ghost" href="/contact">
                Explore Data Capabilities
              </Button>
            </div>
          </div>

          {/* Capabilities video — plays with sound (browser may require prior interaction) */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="overflow-hidden rounded-xl border border-white/10 aspect-video"
          >
            <video
              autoPlay
              loop
              playsInline
              aria-hidden="true"
              className="h-full w-full object-cover"
            >
              <source src="/video/capabilities-ex.mp4" type="video/mp4" />
            </video>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

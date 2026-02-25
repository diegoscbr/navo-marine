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
              <Button variant="outline" href="#contact">
                Explore Data Capabilities
              </Button>
            </div>
          </div>

          {/* Animated dashboard mockup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="rounded-xl border border-white/10 bg-navy-900 p-6 font-mono text-xs"
            aria-hidden="true"
          >
            <div className="mb-4 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-red-500/60" />
              <span className="h-3 w-3 rounded-full bg-yellow-500/60" />
              <span className="h-3 w-3 rounded-full bg-green-500/60" />
              <span className="ml-4 text-white/30">navo-telemetry-dashboard</span>
            </div>
            <div className="space-y-2 text-white/70">
              <p><span className="text-marine-400">fleet</span>.getBoat(<span className="text-cyan-glow">&apos;NAVO-01&apos;</span>)</p>
              <p className="pl-4 text-white/40">→ lat: 37.8044, lng: -122.4194</p>
              <p className="pl-4 text-white/40">→ sog: 12.4kn, cog: 247°</p>
              <p className="pl-4 text-white/40">→ twa: 68°, tws: 18.2kn</p>
              <p className="mt-4"><span className="text-marine-400">race</span>.getLeaderboard()</p>
              <div className="pl-4 text-white/40 space-y-1">
                <p>1. NAVO-01 — 12.4kn — +0:00</p>
                <p>2. NAVO-07 — 11.9kn — +0:12</p>
                <p>3. NAVO-03 — 11.8kn — +0:19</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

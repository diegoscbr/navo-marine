'use client'

import { motion } from 'framer-motion'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Button } from '@/components/ui/Button'

const services = [
  'Certified Integration',
  'Calibration Services',
  'Deployment Strategy',
  'Team Training',
  'System Optimization',
]

export function VakarosSection() {
  return (
    <section id="vakaros" className="py-24 bg-navy-900">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          {/* Visual block */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative overflow-hidden rounded-2xl border border-white/10 bg-black aspect-video flex items-center justify-center"
          >
            <div className="text-center">
              <p className="text-xs uppercase tracking-widest text-white/30">Vakaros</p>
              <p className="mt-2 text-4xl font-bold tracking-tight text-white">Atlas II</p>
              <p className="mt-1 text-xs text-marine-400 tracking-widest">OFFICIAL PARTNER</p>
            </div>
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-8 top-1/4 h-px w-16 bg-marine-500/40" />
              <div className="absolute right-8 bottom-1/3 h-px w-12 bg-marine-500/30" />
              <div className="absolute left-6 bottom-8 h-8 w-px bg-marine-500/20" />
            </div>
          </motion.div>

          {/* Content */}
          <div>
            <SectionHeader
              heading="Official Vakaros Atlas II Partner."
              centered={false}
            />
            <ul className="grid grid-cols-2 gap-4">
              {services.map((service, i) => (
                <motion.li
                  key={service}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="flex items-center gap-3 text-sm text-white/70"
                >
                  <span className="h-px w-6 bg-marine-500" />
                  {service}
                </motion.li>
              ))}
            </ul>
            <div className="mt-10">
              <Button variant="primary" href="/reserve">
                Reserve Units
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

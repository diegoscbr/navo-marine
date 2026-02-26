'use client'

import Image from 'next/image'
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
            className="relative overflow-hidden rounded-2xl aspect-video"
          >
            <Image
              src="/vakaros_spec_transparent.png"
              alt="Vakaros Atlas 2 specification"
              fill
              className="object-contain p-4"
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
          </motion.div>

          {/* Content */}
          <div>
            <SectionHeader
              heading="Official Vakaros Atlas 2 Partner"
              centered
            />
            <ul className="mx-auto grid max-w-xl grid-cols-2 gap-4">
              {services.map((service, i) => (
                <motion.li
                  key={service}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="flex items-center justify-center gap-3 text-center text-sm text-white/70"
                >
                  <span className="h-px w-6 bg-marine-500" />
                  {service}
                </motion.li>
              ))}
            </ul>
            <div className="mt-10 flex justify-center">
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

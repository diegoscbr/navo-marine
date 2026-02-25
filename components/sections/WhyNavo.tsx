'use client'

import { motion } from 'framer-motion'
import { SectionHeader } from '@/components/ui/SectionHeader'

const differentiators = [
  {
    title: 'Performance-First Methodology',
    description: 'Every decision is evaluated against one metric: does it make the boat faster?',
  },
  {
    title: 'Integrated Hardware & Analytics Ecosystem',
    description: 'NAVO connects instrumentation, data pipelines, and race operations into a single system.',
  },
  {
    title: 'International Credibility',
    description: 'Partnerships with Vakaros and UR SAILING place NAVO at the center of global racing.',
  },
  {
    title: 'Technical Precision',
    description: 'We operate at the intersection of engineering and competitive sailing.',
  },
  {
    title: 'Trusted by Elite Programs',
    description: 'Our systems are deployed at the highest levels of the sport.',
  },
]

export function WhyNavo() {
  return (
    <section className="py-24 bg-navy-900">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader heading="Why Leading Teams Choose NAVO." />

        <div className="mx-auto max-w-3xl space-y-6">
          {differentiators.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.07 }}
              className="flex gap-6 border-b border-white/10 pb-6 last:border-0"
            >
              <span className="mt-1 text-xs font-bold text-marine-500">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="font-semibold text-white">{item.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-white/50">{item.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

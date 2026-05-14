'use client'

import { motion } from 'framer-motion'
import { mission } from '@/lib/content/about'

export function CapabilitiesHero() {
  return (
    <section className="relative bg-navy-900 py-28">
      <div className="mx-auto max-w-5xl px-6 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="font-heading text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl"
        >
          {mission.heading}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mt-6 text-lg text-white/70 sm:text-xl"
        >
          {mission.subline}
        </motion.p>
      </div>
    </section>
  )
}

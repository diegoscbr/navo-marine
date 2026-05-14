'use client'

import { motion } from 'framer-motion'
import { stats } from '@/lib/content/about'

export function StatsBand() {
  return (
    <section className="bg-navy-800/40 py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {stats.tiles.map((tile, i) => (
            <motion.div
              key={tile.label}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="text-center"
            >
              <div className="font-heading text-4xl font-semibold tracking-tight text-marine-400 sm:text-5xl">
                {tile.value}
              </div>
              <div className="mt-2 text-sm uppercase tracking-wide text-white/60">
                {tile.label}
              </div>
            </motion.div>
          ))}
        </div>
        <p className="mt-12 text-center text-base text-white/70 sm:text-lg">{stats.kicker}</p>
      </div>
    </section>
  )
}

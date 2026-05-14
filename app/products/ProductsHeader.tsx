'use client'

import { motion } from 'framer-motion'

export function ProductsHeader() {
  return (
    <section className="relative overflow-hidden pt-32 pb-12 sm:pt-36">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(30,110,255,0.12)_0%,transparent_70%)]" />
      <div className="relative z-10 mx-auto max-w-7xl px-6 text-center">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-xs uppercase tracking-[0.28em] text-cyan-glow"
        >
          NAVO Marine Technologies
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05 }}
          className="font-heading mt-4 text-5xl font-semibold leading-tight text-white sm:text-6xl"
        >
          Products
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="mx-auto mt-5 max-w-2xl text-base text-white/65 sm:text-lg"
        >
          Performance hardware and instrumentation for competitive sailing teams,
          plus full-service race management for clubs and regatta organizers.
        </motion.p>
      </div>
    </section>
  )
}

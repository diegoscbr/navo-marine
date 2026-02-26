'use client'

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/Button'

export function ClosingCTA() {
  return (
    <section className="relative overflow-hidden py-32 bg-gradient-to-b from-navy-900 to-navy-800">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_100%,rgba(30,110,255,0.15)_0%,transparent_70%)]" />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7 }}
        className="relative z-10 mx-auto max-w-4xl px-6 text-center"
      >
        <h2 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
          The Future of Marine Performance{' '}
          <br />
          <span className="text-gradient">Starts Here.</span>
        </h2>

        <div className="mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Button variant="primary" href="#contact">
            Partner With NAVO
          </Button>
          <Button variant="ghost" href="#contact">
            Request Consultation
          </Button>
        </div>
      </motion.div>
    </section>
  )
}

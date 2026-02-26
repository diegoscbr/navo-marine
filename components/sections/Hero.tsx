'use client'

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/Button'

export function Hero() {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-navy-800 to-navy-900">

      {/* Background video */}
      <video
        autoPlay
        muted
        loop
        playsInline
        preload="none"
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      >
        <source src="/video/hero-bg.mp4" type="video/mp4" />
      </video>

      {/* Dark overlay — dims video so headline stays legible */}
      <div className="pointer-events-none absolute inset-0 bg-navy-900/60" />

      {/* Subtle data grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(30,110,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(30,110,255,1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Radial glow */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_50%,rgba(30,110,255,0.12)_0%,transparent_70%)]" />

      <div className="relative z-10 mx-auto max-w-5xl px-6 text-center">
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-5xl font-semibold leading-tight tracking-tight text-white sm:text-6xl lg:text-7xl"
        >
          Technology That Moves{' '}
          <br />
          <span className="text-marine-300">
            Sailing Forward.
          </span>
        </motion.h1>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-10 flex items-center justify-center"
        >
          <Button variant="primary" href="/capabilities">
            Explore Our Capabilities
          </Button>
        </motion.div>
      </div>
    </section>
  )
}

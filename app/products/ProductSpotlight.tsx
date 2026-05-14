'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'

type SpotlightProps = {
  eyebrow: string
  eyebrowLogo?: string
  eyebrowLogoAlt?: string
  name: string
  tagline: string
  description: string
  priceLabel: string
  primaryHref: string
  primaryLabel: string
  secondaryHref?: string
  secondaryLabel?: string
  heroImage: string
  heroImageAlt: string
  accentImage?: string
  accentImageAlt?: string
}

export function ProductSpotlight({
  eyebrow,
  eyebrowLogo,
  eyebrowLogoAlt,
  name,
  tagline,
  description,
  priceLabel,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  heroImage,
  heroImageAlt,
  accentImage,
  accentImageAlt,
}: SpotlightProps) {
  return (
    <section className="relative overflow-hidden bg-navy-900 pt-32 pb-20 sm:pt-40 sm:pb-28">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(30,110,255,0.12)_0%,transparent_70%)]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(30,110,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(30,110,255,1) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="text-center"
        >
          {eyebrowLogo ? (
            <div className="mx-auto -my-16 flex h-48 items-center justify-center sm:-my-20 sm:h-56 lg:-my-24 lg:h-64">
              <Image
                src={eyebrowLogo}
                alt={eyebrowLogoAlt ?? eyebrow}
                width={500}
                height={500}
                className="h-full w-auto object-contain"
                priority
              />
            </div>
          ) : (
            <p className="text-xs uppercase tracking-[0.28em] text-cyan-glow">{eyebrow}</p>
          )}
          <h2 className="font-heading mt-4 text-5xl font-semibold leading-tight text-white sm:text-6xl lg:text-7xl">
            {name}
          </h2>
          <p className="font-heading mx-auto mt-4 max-w-3xl text-xl text-marine-300 sm:text-2xl">
            {tagline}
          </p>
          <p className="mx-auto mt-5 max-w-2xl text-base text-white/65 sm:text-lg">
            {description}
          </p>
          <p className="mt-4 text-sm text-white/45">{priceLabel}</p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href={primaryHref}
              className="glass-btn glass-btn-primary inline-flex items-center justify-center px-6 py-3 text-sm font-medium tracking-wide"
            >
              {primaryLabel}
            </Link>
            {secondaryHref && secondaryLabel && (
              <Link
                href={secondaryHref}
                className="inline-flex items-center text-sm font-medium text-marine-300 transition-colors hover:text-cyan-glow"
              >
                {secondaryLabel}
                <span aria-hidden className="ml-1.5">›</span>
              </Link>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="relative mx-auto mt-16 max-w-2xl"
        >
          {/* Soft underglow */}
          <div className="pointer-events-none absolute bottom-0 left-1/2 h-40 w-3/4 -translate-x-1/2 rounded-full bg-marine-500/20 blur-3xl" />

          <Image
            src={heroImage}
            alt={heroImageAlt}
            width={1600}
            height={1600}
            priority
            className="relative h-auto w-full object-contain drop-shadow-[0_30px_80px_rgba(0,212,255,0.18)]"
            sizes="(min-width: 1024px) 640px, 90vw"
          />

          {accentImage && (
            <div className="absolute right-0 bottom-0 hidden w-44 translate-x-1/3 sm:block md:w-56 lg:w-64">
              <Image
                src={accentImage}
                alt={accentImageAlt ?? ''}
                width={800}
                height={1600}
                className="h-auto w-full object-contain drop-shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
                sizes="(min-width: 1024px) 256px, (min-width: 768px) 224px, 176px"
              />
            </div>
          )}
        </motion.div>
      </div>
    </section>
  )
}

'use client'

import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'

type ProductTileProps = {
  eyebrow: string
  name: string
  tagline: string
  description: string
  priceLabel: string
  bullets: string[]
  primaryHref: string
  primaryLabel: string
  secondaryHref?: string
  secondaryLabel?: string
  image: string
  imageAlt: string
  index?: number
}

export function ProductTile({
  eyebrow,
  name,
  tagline,
  description,
  priceLabel,
  bullets,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
  image,
  imageAlt,
  index = 0,
}: ProductTileProps) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5, delay: index * 0.08 }}
      className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-navy-800/60 backdrop-blur-xl transition-all duration-300 hover:border-marine-500/40 hover:bg-navy-800/80"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden">
        <Image
          src={image}
          alt={imageAlt}
          fill
          className="object-cover object-center transition-transform duration-700 group-hover:scale-105"
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-navy-900 via-navy-900/40 to-transparent" />
        <p className="absolute top-4 left-5 text-[11px] uppercase tracking-[0.28em] text-cyan-glow">
          {eyebrow}
        </p>
      </div>

      <div className="flex flex-1 flex-col p-7">
        <h3 className="font-heading text-2xl font-semibold text-white">{name}</h3>
        <p className="font-heading mt-1 text-base text-marine-300">{tagline}</p>
        <p className="mt-3 text-sm leading-relaxed text-white/60">{description}</p>

        {bullets.length > 0 && (
          <ul className="mt-5 space-y-1.5">
            {bullets.map((bullet) => (
              <li
                key={bullet}
                className="flex items-start gap-2 text-xs text-white/55"
              >
                <span aria-hidden className="mt-0.5 text-marine-400">✓</span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto pt-6">
          <p className="text-base font-medium text-white">{priceLabel}</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href={primaryHref}
              className="glass-btn glass-btn-primary inline-flex items-center justify-center px-5 py-2.5 text-sm font-medium tracking-wide"
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
        </div>
      </div>
    </motion.article>
  )
}

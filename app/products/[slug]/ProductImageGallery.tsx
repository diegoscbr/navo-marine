'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'
import { motion } from 'framer-motion'

type ProductImage = {
  src: string
  alt: string
}

type ProductImageGalleryProps = {
  images: ProductImage[]
}

export function ProductImageGallery({ images }: ProductImageGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

  if (images.length === 0) {
    return null
  }

  const activeImage = images[activeIndex]

  const previous = () => {
    setActiveIndex((current) => (current - 1 + images.length) % images.length)
  }

  const next = () => {
    setActiveIndex((current) => (current + 1) % images.length)
  }

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.changedTouches[0]
    touchStartX.current = touch.clientX
    touchStartY.current = touch.clientY
  }

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (touchStartX.current === null || touchStartY.current === null) {
      return
    }

    const touch = event.changedTouches[0]
    const deltaX = touch.clientX - touchStartX.current
    const deltaY = touch.clientY - touchStartY.current

    touchStartX.current = null
    touchStartY.current = null

    if (Math.abs(deltaX) < 40 || Math.abs(deltaX) < Math.abs(deltaY)) {
      return
    }

    if (deltaX < 0) {
      next()
      return
    }

    previous()
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="overflow-hidden rounded-xl border border-white/10 bg-navy-800/60 p-4 shadow-[0_24px_60px_rgba(0,0,0,0.3)] backdrop-blur-xl sm:p-5"
    >
      <div
        className="relative overflow-hidden rounded-lg border border-white/10 bg-navy-900 touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="pointer-events-none absolute inset-y-0 left-0 z-[5] w-16 bg-gradient-to-r from-navy-900/60 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-[5] w-16 bg-gradient-to-l from-navy-900/60 to-transparent" />

        {/* Previous button */}
        <button
          type="button"
          onClick={previous}
          className="absolute top-1/2 left-3 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-navy-800/60 backdrop-blur-xl transition-all duration-200 hover:border-white/40 hover:bg-navy-800 sm:h-11 sm:w-11"
          aria-label="Previous image"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/80">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <Image
          src={activeImage.src}
          alt={activeImage.alt}
          width={2000}
          height={2000}
          className="mx-auto h-auto w-full max-w-3xl object-contain"
          priority={activeIndex === 0}
        />

        {/* Next button */}
        <button
          type="button"
          onClick={next}
          className="absolute top-1/2 right-3 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-navy-800/60 backdrop-blur-xl transition-all duration-200 hover:border-white/40 hover:bg-navy-800 sm:h-11 sm:w-11"
          aria-label="Next image"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/80">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Dot indicators */}
      <div className="mt-4 flex items-center justify-center gap-2">
        {images.map((_, index) => (
          <button
            key={index}
            type="button"
            onClick={() => setActiveIndex(index)}
            className={`h-1.5 rounded-full transition-all duration-200 ${
              index === activeIndex
                ? 'w-6 bg-marine-400'
                : 'w-1.5 bg-white/25 hover:bg-white/40'
            }`}
            aria-label={`Show image ${index + 1}`}
          />
        ))}
      </div>

      {/* Thumbnails */}
      <div className="mt-4 grid grid-cols-6 gap-2">
        {images.map((image, index) => (
          <button
            key={image.src}
            type="button"
            onClick={() => setActiveIndex(index)}
            className={`overflow-hidden rounded-lg border transition-colors ${
              index === activeIndex ? 'border-marine-400' : 'border-white/10 hover:border-white/30'
            } bg-navy-900`}
            aria-label={`Show image ${index + 1}`}
          >
            <Image
              src={image.src}
              alt={image.alt}
              width={200}
              height={200}
              className="h-auto w-full object-cover"
            />
          </button>
        ))}
      </div>
    </motion.div>
  )
}

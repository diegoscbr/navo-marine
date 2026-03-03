'use client'

import { useRef, useState } from 'react'
import Image from 'next/image'

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
    <div className="overflow-hidden rounded-[2.2rem] border border-white/20 bg-white/[0.06] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.35)] backdrop-blur-2xl sm:p-6">
      <div
        className="relative overflow-hidden rounded-[1.7rem] border border-white/20 bg-[#0e0f12] touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="pointer-events-none absolute inset-y-0 left-0 z-[5] w-20 bg-gradient-to-r from-black/40 to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-[5] w-20 bg-gradient-to-l from-black/40 to-transparent" />
        <button
          type="button"
          onClick={previous}
          className="absolute top-1/2 left-3 z-10 h-11 w-11 -translate-y-1/2 rounded-full border border-white/45 bg-black/20 text-2xl leading-none text-white/95 opacity-85 backdrop-blur-xl transition-all duration-200 hover:bg-black/45 hover:opacity-100 sm:h-12 sm:w-12"
          aria-label="Previous image"
        >
          {'<'}
        </button>
        <Image
          src={activeImage.src}
          alt={activeImage.alt}
          width={2000}
          height={2000}
          className="mx-auto h-auto w-full max-w-3xl object-contain"
          priority={activeIndex === 0}
        />
        <button
          type="button"
          onClick={next}
          className="absolute top-1/2 right-3 z-10 h-11 w-11 -translate-y-1/2 rounded-full border border-white/45 bg-black/20 text-2xl leading-none text-white/95 opacity-85 backdrop-blur-xl transition-all duration-200 hover:bg-black/45 hover:opacity-100 sm:h-12 sm:w-12"
          aria-label="Next image"
        >
          {'>'}
        </button>
      </div>

      <div className="mt-4 text-center">
        <p className="text-sm text-white/70">
          {activeIndex + 1} / {images.length}
        </p>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-7">
        {images.map((image, index) => (
          <button
            key={image.src}
            type="button"
            onClick={() => setActiveIndex(index)}
            className={`overflow-hidden rounded-xl border ${
              index === activeIndex ? 'border-marine-400' : 'border-white/20'
            } bg-white/[0.05] transition-colors hover:border-white/50`}
            aria-label={`Show image ${index + 1}`}
          >
            <Image
              src={image.src}
              alt={image.alt}
              width={2000}
              height={2000}
              className="h-auto w-full object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  )
}

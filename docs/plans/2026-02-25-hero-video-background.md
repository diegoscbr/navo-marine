# Hero Video Background Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a self-hosted, autoplaying video as the full-bleed background of the Hero section, with a dark overlay to preserve headline legibility.

**Architecture:** A `<video>` element is positioned `absolute inset-0` inside the Hero `<section>`, scaled with `object-fit: cover`. A semi-transparent navy overlay (`bg-navy-900/60`) sits on top of the video but below the existing brand elements (grid, glow) and content. Fallback is the existing navy gradient already on `<section>`.

**Tech Stack:** React, Next.js App Router, Tailwind CSS v4, Jest + React Testing Library

---

## Pre-requisite: Download the video (manual, one-time)

Run this before starting any code tasks:

```bash
brew install yt-dlp   # skip if already installed
mkdir -p public/video
yt-dlp "https://www.facebook.com/espsailing/videos/1644167686354464/" -o "public/video/hero-bg.mp4"
```

Verify the file exists:

```bash
ls -lh public/video/hero-bg.mp4
```

Expected: file is present, size > 1 MB. If `yt-dlp` fails with a Facebook login error, you can manually download the video from Facebook and save it to `public/video/hero-bg.mp4`.

---

## Task 1: Add video background tests to Hero.test.tsx

**Files:**
- Modify: `__tests__/components/sections/Hero.test.tsx`

### Step 1: Add a JSDOM media mock and two new test cases

Open `__tests__/components/sections/Hero.test.tsx`. The full updated file should be:

```tsx
import { render, screen } from '@testing-library/react'
import { Hero } from '@/components/sections/Hero'

// JSDOM doesn't implement HTMLMediaElement — mock play/pause so React
// doesn't throw when the autoPlay attribute triggers internal calls.
beforeAll(() => {
  window.HTMLMediaElement.prototype.play = jest.fn()
  window.HTMLMediaElement.prototype.pause = jest.fn()
})

describe('Hero', () => {
  it('renders primary headline', () => {
    render(<Hero />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Technology That Moves Sailing Forward.'
    )
  })

  it('renders subheadline with partner credentials', () => {
    render(<Hero />)
    expect(screen.getByText(/official vakaros atlas ii partner/i)).toBeInTheDocument()
  })

  it('renders primary CTA', () => {
    render(<Hero />)
    expect(screen.getByRole('link', { name: /explore our capabilities/i })).toBeInTheDocument()
  })

  it('renders secondary CTA', () => {
    render(<Hero />)
    expect(screen.getByRole('link', { name: /partner with navo/i })).toBeInTheDocument()
  })

  it('renders a background video element', () => {
    const { container } = render(<Hero />)
    const video = container.querySelector('video')
    expect(video).toBeInTheDocument()
    expect(video).toHaveAttribute('autoplay')
    expect(video).toHaveAttribute('muted')
    expect(video).toHaveAttribute('loop')
    expect(video).toHaveAttribute('playsinline')
  })

  it('video source points to the hosted file', () => {
    const { container } = render(<Hero />)
    const source = container.querySelector('video source')
    expect(source).toBeInTheDocument()
    expect(source).toHaveAttribute('src', '/video/hero-bg.mp4')
    expect(source).toHaveAttribute('type', 'video/mp4')
  })
})
```

### Step 2: Run the new tests — they should FAIL

```bash
npx jest --testPathPattern=Hero -t "background video"
```

Expected output:
```
FAIL __tests__/components/sections/Hero.test.tsx
  ✕ renders a background video element
  ✕ video source points to the hosted file
```

If they somehow pass, the implementation already exists — skip to Task 2 verification.

---

## Task 2: Update Hero.tsx to add the video background

**Files:**
- Modify: `components/sections/Hero.tsx`

### Step 1: Replace the file contents

The full updated `components/sections/Hero.tsx`:

```tsx
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
        className="absolute inset-0 h-full w-full object-cover"
      >
        <source src="/video/hero-bg.mp4" type="video/mp4" />
      </video>

      {/* Dark overlay — dims video so headline stays legible */}
      <div className="absolute inset-0 bg-navy-900/60" />

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
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-6 text-xs font-semibold uppercase tracking-[0.3em] text-marine-400"
        >
          Official Vakaros Atlas II Partner · Premier Partner of UR SAILING
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-5xl font-semibold leading-tight tracking-tight text-white sm:text-6xl lg:text-7xl"
        >
          Technology That Moves{' '}
          <br />
          <span className="text-gradient">Sailing Forward.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mx-auto mt-8 max-w-2xl text-lg text-white/60"
        >
          Premier Race Management & Performance Data Specialists.
          Hardware, analytics, and race execution — unified.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
        >
          <Button variant="primary" href="#capabilities">
            Explore Our Capabilities
          </Button>
          <Button variant="outline" href="#contact">
            Partner With NAVO
          </Button>
        </motion.div>
      </div>
    </section>
  )
}
```

### Step 2: Run all Hero tests — they should all pass

```bash
npx jest --testPathPattern=Hero
```

Expected output:
```
PASS __tests__/components/sections/Hero.test.tsx
  ✓ renders primary headline
  ✓ renders subheadline with partner credentials
  ✓ renders primary CTA
  ✓ renders secondary CTA
  ✓ renders a background video element
  ✓ video source points to the hosted file

Test Suites: 1 passed
Tests:       6 passed
```

If any test fails, check that attribute names are lowercase in the DOM (`autoplay`, `playsinline`) and that the `<source>` is a direct child of `<video>`.

### Step 3: Run the full test suite to confirm no regressions

```bash
npx jest
```

Expected: all suites pass.

### Step 4: Commit

```bash
git add __tests__/components/sections/Hero.test.tsx components/sections/Hero.tsx
git commit -m "feat: add autoplaying video background to Hero section"
```

---

## Task 3: Visual verification in the browser

### Step 1: Ensure the video file is present

```bash
ls public/video/hero-bg.mp4
```

### Step 2: Start the dev server

```bash
npm run dev
```

### Step 3: Open http://localhost:3000

Check:
- [ ] Video plays automatically (muted) on load
- [ ] Video loops seamlessly
- [ ] Headline and CTAs are clearly legible over the video
- [ ] On mobile viewport (DevTools → responsive): video fills the section without letterboxing
- [ ] If you temporarily rename `public/video/hero-bg.mp4`, the fallback navy gradient shows with no broken UI

### Step 4: Stop the server

`Ctrl+C`

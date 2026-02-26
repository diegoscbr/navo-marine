# Site Restructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convert the single-scroll landing page into a multi-page Next.js app with real routes, remove deprecated sections, add a reservation placeholder, replace a mockup with a real video, and apply Apple Liquid Glass styling to all buttons.

**Architecture:** Option A — minimal surgery. All existing component files stay in `components/sections/`. New pages in `app/` import them directly. The Button component is the shared foundation; update it first so every downstream change inherits the glass style automatically.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, Framer Motion, Jest + RTL, `next/link` for client-side navigation.

**Design doc:** `docs/plans/2026-02-25-site-restructure-design.md`

---

## Task 1: Add Liquid Glass CSS to globals.css

No tests needed — pure CSS utility classes.

**Files:**
- Modify: `app/globals.css`

**Step 1: Add glass button classes after the `@utility text-gradient` block**

Append to `app/globals.css`:

```css
/* ─── Liquid Glass Button System ────────────────────────────── */
@layer components {
  .glass-btn {
    position: relative;
    overflow: hidden;
    backdrop-filter: blur(16px) saturate(180%);
    -webkit-backdrop-filter: blur(16px) saturate(180%);
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    transition: background 0.2s ease, border-color 0.2s ease;
  }

  /* Specular highlight — simulates Apple's top-edge light reflection */
  .glass-btn::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 50%;
    background: linear-gradient(
      to bottom,
      rgba(255, 255, 255, 0.13),
      rgba(255, 255, 255, 0.02)
    );
    pointer-events: none;
    border-radius: inherit;
  }

  .glass-btn:hover {
    background: rgba(255, 255, 255, 0.13);
    border-color: rgba(255, 255, 255, 0.22);
  }

  .glass-btn:focus-visible {
    outline: 2px solid rgba(30, 110, 255, 0.8);
    outline-offset: 2px;
  }

  /* Primary variant — marine blue tint */
  .glass-btn-primary {
    background: rgba(30, 110, 255, 0.18);
    border-color: rgba(30, 110, 255, 0.35);
    color: #ffffff;
  }

  .glass-btn-primary:hover {
    background: rgba(30, 110, 255, 0.28);
    border-color: rgba(30, 110, 255, 0.5);
  }

  /* Ghost variant — pure glass, no tint */
  .glass-btn-ghost {
    background: rgba(255, 255, 255, 0.06);
    border-color: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.85);
  }

  .glass-btn-ghost:hover {
    background: rgba(255, 255, 255, 0.11);
    border-color: rgba(255, 255, 255, 0.2);
    color: #ffffff;
  }
}
```

**Step 2: Verify the dev server still compiles**

```bash
npm run build
```

Expected: exit 0, no errors.

**Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: add liquid glass button CSS utilities"
```

---

## Task 2: Redesign Button component

The `outline` variant is replaced with `ghost`. The component switches to `next/link` for `href` props so client-side navigation works correctly.

**Files:**
- Modify: `__tests__/components/ui/Button.test.tsx`
- Modify: `components/ui/Button.tsx`

**Step 1: Update the test — rewrite `__tests__/components/ui/Button.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '@/components/ui/Button'

describe('Button', () => {
  it('renders primary variant as a button', () => {
    render(<Button variant="primary">Save</Button>)
    const btn = screen.getByRole('button', { name: 'Save' })
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveClass('glass-btn', 'glass-btn-primary')
  })

  it('renders ghost variant as a button', () => {
    render(<Button variant="ghost">Login</Button>)
    const btn = screen.getByRole('button', { name: 'Login' })
    expect(btn).toHaveClass('glass-btn', 'glass-btn-ghost')
  })

  it('calls onClick handler', async () => {
    const user = userEvent.setup()
    const onClick = jest.fn()
    render(<Button variant="primary" onClick={onClick}>Click</Button>)
    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders as a link when href is provided', () => {
    render(<Button variant="primary" href="/capabilities">Go</Button>)
    expect(screen.getByRole('link', { name: 'Go' })).toHaveAttribute('href', '/capabilities')
  })

  it('applies glass-btn class regardless of variant', () => {
    const { rerender } = render(<Button variant="primary">A</Button>)
    expect(screen.getByRole('button')).toHaveClass('glass-btn')
    rerender(<Button variant="ghost">A</Button>)
    expect(screen.getByRole('button')).toHaveClass('glass-btn')
  })
})
```

**Step 2: Run tests — expect failures**

```bash
npx jest __tests__/components/ui/Button.test.tsx --no-coverage
```

Expected: FAIL — `ghost` variant not defined, `glass-btn` class not applied.

**Step 3: Rewrite `components/ui/Button.tsx`**

```tsx
import { forwardRef } from 'react'
import Link from 'next/link'

type Variant = 'primary' | 'ghost'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant: Variant
  href?: string
  children: React.ReactNode
}

const variantClass: Record<Variant, string> = {
  primary: 'glass-btn-primary',
  ghost: 'glass-btn-ghost',
}

const base =
  'glass-btn inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-medium tracking-wide disabled:opacity-50'

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, href, children, className = '', ...props }, ref) => {
    const classes = `${base} ${variantClass[variant]} ${className}`

    if (href) {
      return (
        <Link href={href} className={classes}>
          {children}
        </Link>
      )
    }

    return (
      <button ref={ref} className={classes} {...props}>
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
```

**Step 4: Run tests — expect pass**

```bash
npx jest __tests__/components/ui/Button.test.tsx --no-coverage
```

Expected: PASS (5 tests).

**Step 5: Commit**

```bash
git add components/ui/Button.tsx __tests__/components/ui/Button.test.tsx
git commit -m "feat: redesign Button with liquid glass style, add ghost variant, use next/link"
```

---

## Task 3: Update Navbar

Remove "Partner With NAVO", add Login button, convert anchor links to page routes.

**Files:**
- Modify: `__tests__/components/layout/Navbar.test.tsx`
- Modify: `components/layout/Navbar.tsx`

**Step 1: Update `__tests__/components/layout/Navbar.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import { Navbar } from '@/components/layout/Navbar'

describe('Navbar', () => {
  it('renders NAVO logo', () => {
    render(<Navbar />)
    expect(screen.getByAltText('NAVO Marine Technologies')).toBeInTheDocument()
  })

  it('renders Capabilities nav link pointing to /capabilities', () => {
    render(<Navbar />)
    const link = screen.getByRole('link', { name: /capabilities/i })
    expect(link).toHaveAttribute('href', '/capabilities')
  })

  it('renders Contact nav link pointing to /contact', () => {
    render(<Navbar />)
    const link = screen.getByRole('link', { name: /^contact$/i })
    expect(link).toHaveAttribute('href', '/contact')
  })

  it('renders Reserve nav link pointing to /reserve', () => {
    render(<Navbar />)
    const link = screen.getByRole('link', { name: /reserve/i })
    expect(link).toHaveAttribute('href', '/reserve')
  })

  it('renders Login button', () => {
    render(<Navbar />)
    expect(screen.getByRole('link', { name: /login/i })).toBeInTheDocument()
  })

  it('does NOT render Partner With NAVO button', () => {
    render(<Navbar />)
    expect(screen.queryByRole('link', { name: /partner with navo/i })).not.toBeInTheDocument()
  })

  it('does NOT render Race Management link', () => {
    render(<Navbar />)
    expect(screen.queryByRole('link', { name: /race management/i })).not.toBeInTheDocument()
  })
})
```

**Step 2: Run tests — expect failures**

```bash
npx jest __tests__/components/layout/Navbar.test.tsx --no-coverage
```

Expected: FAIL — wrong links, Partner With NAVO still present.

**Step 3: Rewrite `components/layout/Navbar.tsx`**

```tsx
'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'

const navLinks = [
  { label: 'Capabilities', href: '/capabilities' },
  { label: 'Contact', href: '/contact' },
  { label: 'Reserve', href: '/reserve' },
]

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 z-50 w-full transition-all duration-300 ${
        scrolled ? 'bg-navy-900/95 backdrop-blur-md shadow-lg' : 'bg-transparent'
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center">
          <Image
            src="/logos/transparent_background_logo.png"
            alt="NAVO Marine Technologies"
            width={120}
            height={32}
            priority
          />
        </Link>

        <ul className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-sm text-white/70 transition-colors hover:text-white"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <Button variant="ghost" href="/login">
          Login
        </Button>
      </nav>
    </header>
  )
}
```

**Step 4: Run tests — expect pass**

```bash
npx jest __tests__/components/layout/Navbar.test.tsx --no-coverage
```

Expected: PASS (7 tests).

**Step 5: Commit**

```bash
git add components/layout/Navbar.tsx __tests__/components/layout/Navbar.test.tsx
git commit -m "feat: update Navbar — page routes, Login button, remove Partner With NAVO"
```

---

## Task 4: Clean up home page (`app/page.tsx`)

Remove deprecated sections from the home page render.

**Files:**
- Modify: `__tests__/components/page.test.tsx`
- Modify: `app/page.tsx`

**Step 1: Update `__tests__/components/page.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import Page from '@/app/page'

// Mock HTMLMediaElement for video in Hero
beforeAll(() => {
  jest.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  jest.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
})
afterAll(() => { jest.restoreAllMocks() })

describe('Home page', () => {
  it('renders Hero headline', () => {
    render(<Page />)
    expect(screen.getByRole('heading', { name: /technology that moves/i })).toBeInTheDocument()
  })

  it('renders VakarosSection heading', () => {
    render(<Page />)
    expect(screen.getByRole('heading', { name: /official vakaros/i })).toBeInTheDocument()
  })

  it('does NOT render CoreCapabilities section', () => {
    render(<Page />)
    expect(screen.queryByRole('heading', { name: /built for high-performance/i })).not.toBeInTheDocument()
  })

  it('does NOT render RaceManagement section', () => {
    render(<Page />)
    expect(screen.queryByRole('heading', { name: /elite race execution/i })).not.toBeInTheDocument()
  })

  it('does NOT render contact section', () => {
    render(<Page />)
    expect(screen.queryByRole('heading', { name: /get in touch/i })).not.toBeInTheDocument()
  })
})
```

**Step 2: Run tests — expect failures**

```bash
npx jest __tests__/components/page.test.tsx --no-coverage
```

Expected: FAIL — deprecated sections still rendered.

**Step 3: Rewrite `app/page.tsx`**

```tsx
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { Hero } from '@/components/sections/Hero'
import { AuthorityStrip } from '@/components/sections/AuthorityStrip'
import { VakarosSection } from '@/components/sections/VakarosSection'

export default function Page() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <AuthorityStrip />
        <VakarosSection />
      </main>
      <Footer />
    </>
  )
}
```

**Step 4: Run tests — expect pass**

```bash
npx jest __tests__/components/page.test.tsx --no-coverage
```

Expected: PASS (5 tests).

**Step 5: Commit**

```bash
git add app/page.tsx __tests__/components/page.test.tsx
git commit -m "feat: slim home page to Hero + AuthorityStrip + VakarosSection"
```

---

## Task 5: Update Hero section

Remove "Partner With NAVO" button, update primary CTA href to `/capabilities`.

**Files:**
- Modify: `__tests__/components/sections/Hero.test.tsx`
- Modify: `components/sections/Hero.tsx`

**Step 1: Update `__tests__/components/sections/Hero.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import { Hero } from '@/components/sections/Hero'

beforeAll(() => {
  jest.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  jest.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
})
afterAll(() => { jest.restoreAllMocks() })

describe('Hero', () => {
  it('renders primary headline', () => {
    render(<Hero />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Technology That Moves Sailing Forward.'
    )
  })

  it('renders Explore Our Capabilities CTA linking to /capabilities', () => {
    render(<Hero />)
    const link = screen.getByRole('link', { name: /explore our capabilities/i })
    expect(link).toHaveAttribute('href', '/capabilities')
  })

  it('does NOT render Partner With NAVO button', () => {
    render(<Hero />)
    expect(screen.queryByRole('link', { name: /partner with navo/i })).not.toBeInTheDocument()
  })

  it('renders a background video element that is muted and hidden', () => {
    const { container } = render(<Hero />)
    const video = container.querySelector('video')
    expect(video).toBeInTheDocument()
    expect(video?.muted).toBe(true)
    expect(video).toHaveAttribute('aria-hidden', 'true')
  })

  it('video source points to hero-bg.mp4', () => {
    const { container } = render(<Hero />)
    const source = container.querySelector('video source')
    expect(source).toHaveAttribute('src', '/video/hero-bg.mp4')
  })
})
```

**Step 2: Run tests — expect failures**

```bash
npx jest __tests__/components/sections/Hero.test.tsx --no-coverage
```

Expected: FAIL — Partner With NAVO still rendered, href still `#capabilities`.

**Step 3: Update `components/sections/Hero.tsx`**

Change the button block (lines 53–65). Replace:

```tsx
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
```

With:

```tsx
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
```

**Step 4: Run tests — expect pass**

```bash
npx jest __tests__/components/sections/Hero.test.tsx --no-coverage
```

Expected: PASS (5 tests).

**Step 5: Commit**

```bash
git add components/sections/Hero.tsx __tests__/components/sections/Hero.test.tsx
git commit -m "feat: Hero — remove Partner With NAVO button, link CTA to /capabilities"
```

---

## Task 6: Update VakarosSection

Replace "Learn About Atlas II Integration" with "Reserve Units" linking to `/reserve`.

**Files:**
- Modify: `__tests__/components/sections/VakarosSection.test.tsx`
- Modify: `components/sections/VakarosSection.tsx`

**Step 1: Update `__tests__/components/sections/VakarosSection.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import { VakarosSection } from '@/components/sections/VakarosSection'

describe('VakarosSection', () => {
  it('renders heading with official partner claim', () => {
    render(<VakarosSection />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Official Vakaros Atlas II Partner.'
    )
  })

  it('renders all 5 service items', () => {
    render(<VakarosSection />)
    expect(screen.getByText(/certified integration/i)).toBeInTheDocument()
    expect(screen.getByText(/calibration services/i)).toBeInTheDocument()
    expect(screen.getByText(/deployment strategy/i)).toBeInTheDocument()
    expect(screen.getByText(/team training/i)).toBeInTheDocument()
    expect(screen.getByText(/system optimization/i)).toBeInTheDocument()
  })

  it('renders Reserve Units CTA linking to /reserve', () => {
    render(<VakarosSection />)
    const link = screen.getByRole('link', { name: /reserve units/i })
    expect(link).toHaveAttribute('href', '/reserve')
  })

  it('does NOT render the old Learn About button', () => {
    render(<VakarosSection />)
    expect(screen.queryByRole('link', { name: /atlas ii integration/i })).not.toBeInTheDocument()
  })
})
```

**Step 2: Run tests — expect failures**

```bash
npx jest __tests__/components/sections/VakarosSection.test.tsx --no-coverage
```

Expected: FAIL — old button text still present.

**Step 3: Update `components/sections/VakarosSection.tsx`**

Change only the button (line 62–64). Replace:

```tsx
<Button variant="primary" href="#contact">
  Learn About Atlas II Integration
</Button>
```

With:

```tsx
<Button variant="primary" href="/reserve">
  Reserve Units
</Button>
```

**Step 4: Run tests — expect pass**

```bash
npx jest __tests__/components/sections/VakarosSection.test.tsx --no-coverage
```

Expected: PASS (4 tests).

**Step 5: Commit**

```bash
git add components/sections/VakarosSection.tsx __tests__/components/sections/VakarosSection.test.tsx
git commit -m "feat: VakarosSection — Replace CTA with Reserve Units button"
```

---

## Task 7: Replace DataCapabilities code mockup with video

Swap the animated code panel on the right with `capabilities-ex.mp4`. Update the `outline` variant reference to `ghost`.

**Files:**
- Modify: `__tests__/components/sections/DataCapabilities.test.tsx`
- Modify: `components/sections/DataCapabilities.tsx`

**Step 1: Update `__tests__/components/sections/DataCapabilities.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import { DataCapabilities } from '@/components/sections/DataCapabilities'

beforeAll(() => {
  jest.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  jest.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
})
afterAll(() => { jest.restoreAllMocks() })

describe('DataCapabilities', () => {
  it('renders section heading', () => {
    render(<DataCapabilities />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Advanced Data Infrastructure for Modern Racing.'
    )
  })

  it('renders all 5 data capabilities', () => {
    render(<DataCapabilities />)
    expect(screen.getByText(/high-frequency gps/i)).toBeInTheDocument()
    expect(screen.getByText(/wind.*current.*tactical/i)).toBeInTheDocument()
    expect(screen.getByText(/performance benchmarking/i)).toBeInTheDocument()
    expect(screen.getByText(/historical comparison/i)).toBeInTheDocument()
    expect(screen.getByText(/live.*post-event.*pipeline/i)).toBeInTheDocument()
  })

  it('renders explore CTA', () => {
    render(<DataCapabilities />)
    expect(screen.getByRole('link', { name: /explore data capabilities/i })).toBeInTheDocument()
  })

  it('renders capabilities video element', () => {
    const { container } = render(<DataCapabilities />)
    const video = container.querySelector('video')
    expect(video).toBeInTheDocument()
    expect(video).toHaveAttribute('loop')
    expect(video).toHaveAttribute('playsinline')
  })

  it('video source points to capabilities-ex.mp4', () => {
    const { container } = render(<DataCapabilities />)
    const source = container.querySelector('video source')
    expect(source).toHaveAttribute('src', '/video/capabilities-ex.mp4')
  })

  it('does NOT render the code mockup panel', () => {
    render(<DataCapabilities />)
    expect(screen.queryByText(/navo-telemetry-dashboard/i)).not.toBeInTheDocument()
  })
})
```

**Step 2: Run tests — expect failures**

```bash
npx jest __tests__/components/sections/DataCapabilities.test.tsx --no-coverage
```

Expected: FAIL — no video element, code mockup still present.

**Step 3: Update `components/sections/DataCapabilities.tsx`**

Replace the `<motion.div>` mockup block (lines 53–79) and update the Button variant. New file:

```tsx
'use client'

import { motion } from 'framer-motion'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Button } from '@/components/ui/Button'

const dataPoints = [
  { label: 'High-Frequency GPS Telemetry', detail: '10Hz position + heading data' },
  { label: 'Wind, Current & Tactical Overlays', detail: 'Real-time environmental integration' },
  { label: 'Performance Benchmarking', detail: 'Fleet-relative speed indices' },
  { label: 'Historical Comparison Engine', detail: 'Race-over-race delta analysis' },
  { label: 'Live & Post-Event Data Pipelines', detail: 'Streaming and batch delivery' },
]

export function DataCapabilities() {
  return (
    <section id="data" className="py-24 bg-navy-800/40">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          <div>
            <SectionHeader
              heading="Advanced Data Infrastructure for Modern Racing."
              centered={false}
            />
            <ul className="space-y-6">
              {dataPoints.map((point, i) => (
                <motion.li
                  key={point.label}
                  initial={{ opacity: 0, x: -16 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  className="flex gap-4"
                >
                  <span className="mt-1 h-5 w-5 flex-shrink-0 rounded-sm bg-marine-500/20 text-center text-xs font-bold leading-5 text-marine-400">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <p className="font-medium text-white">{point.label}</p>
                    <p className="mt-0.5 text-sm text-white/50">{point.detail}</p>
                  </div>
                </motion.li>
              ))}
            </ul>
            <div className="mt-10">
              <Button variant="ghost" href="#contact">
                Explore Data Capabilities
              </Button>
            </div>
          </div>

          {/* Capabilities video */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="overflow-hidden rounded-xl border border-white/10 aspect-video"
          >
            <video
              autoPlay
              loop
              playsInline
              className="h-full w-full object-cover"
            >
              <source src="/video/capabilities-ex.mp4" type="video/mp4" />
            </video>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
```

> **Note on sound:** The `<video>` has no `muted` attribute so the browser will attempt to play with sound. Most browsers block autoplay with sound on fresh page load until the user interacts with the page — this is expected behavior per the approved design.

**Step 4: Run tests — expect pass**

```bash
npx jest __tests__/components/sections/DataCapabilities.test.tsx --no-coverage
```

Expected: PASS (6 tests).

**Step 5: Commit**

```bash
git add components/sections/DataCapabilities.tsx __tests__/components/sections/DataCapabilities.test.tsx
git commit -m "feat: DataCapabilities — replace code mockup with capabilities-ex.mp4 video"
```

---

## Task 8: Create /capabilities page

**Files:**
- Create: `app/capabilities/page.tsx`
- Create: `__tests__/app/capabilities.test.tsx`

**Step 1: Write the failing test — create `__tests__/app/capabilities.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import CapabilitiesPage from '@/app/capabilities/page'

beforeAll(() => {
  jest.spyOn(window.HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve())
  jest.spyOn(window.HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
})
afterAll(() => { jest.restoreAllMocks() })

describe('/capabilities page', () => {
  it('renders CoreCapabilities heading', () => {
    render(<CapabilitiesPage />)
    expect(screen.getByRole('heading', { name: /built for high-performance/i })).toBeInTheDocument()
  })

  it('renders DataCapabilities heading', () => {
    render(<CapabilitiesPage />)
    expect(
      screen.getByRole('heading', { name: /advanced data infrastructure/i })
    ).toBeInTheDocument()
  })
})
```

**Step 2: Run test — expect failure**

```bash
npx jest __tests__/app/capabilities.test.tsx --no-coverage
```

Expected: FAIL — module not found.

**Step 3: Create `app/capabilities/page.tsx`**

```tsx
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { CoreCapabilities } from '@/components/sections/CoreCapabilities'
import { DataCapabilities } from '@/components/sections/DataCapabilities'

export default function CapabilitiesPage() {
  return (
    <>
      <Navbar />
      <main className="pt-24">
        <CoreCapabilities />
        <DataCapabilities />
      </main>
      <Footer />
    </>
  )
}
```

**Step 4: Run test — expect pass**

```bash
npx jest __tests__/app/capabilities.test.tsx --no-coverage
```

Expected: PASS (2 tests).

**Step 5: Commit**

```bash
git add app/capabilities/page.tsx __tests__/app/capabilities.test.tsx
git commit -m "feat: add /capabilities page with CoreCapabilities and DataCapabilities"
```

---

## Task 9: Create /contact page

**Files:**
- Create: `app/contact/page.tsx`
- Create: `__tests__/app/contact.test.tsx`

**Step 1: Write the failing test — create `__tests__/app/contact.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import ContactPage from '@/app/contact/page'

describe('/contact page', () => {
  it('renders ContactSection heading', () => {
    render(<ContactPage />)
    expect(screen.getByRole('heading', { name: /get in touch/i })).toBeInTheDocument()
  })
})
```

**Step 2: Run test — expect failure**

```bash
npx jest __tests__/app/contact.test.tsx --no-coverage
```

Expected: FAIL — module not found.

**Step 3: Create `app/contact/page.tsx`**

```tsx
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { ContactSection } from '@/components/sections/ContactSection'

export default function ContactPage() {
  return (
    <>
      <Navbar />
      <main className="pt-24">
        <ContactSection />
      </main>
      <Footer />
    </>
  )
}
```

**Step 4: Run test — expect pass**

```bash
npx jest __tests__/app/contact.test.tsx --no-coverage
```

Expected: PASS.

**Step 5: Commit**

```bash
git add app/contact/page.tsx __tests__/app/contact.test.tsx
git commit -m "feat: add /contact page"
```

---

## Task 10: Create /reserve page (Coming Soon skeleton)

**Files:**
- Create: `app/reserve/page.tsx`
- Create: `__tests__/app/reserve.test.tsx`

**Step 1: Write the failing test — create `__tests__/app/reserve.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react'
import ReservePage from '@/app/reserve/page'

describe('/reserve page', () => {
  it('renders the coming soon heading', () => {
    render(<ReservePage />)
    expect(screen.getByRole('heading', { name: /reserve vakaros atlas ii units/i })).toBeInTheDocument()
  })

  it('renders coming soon message', () => {
    render(<ReservePage />)
    expect(screen.getByText(/reservation system launching soon/i)).toBeInTheDocument()
  })

  it('renders email input', () => {
    render(<ReservePage />)
    expect(screen.getByRole('textbox', { name: /email/i })).toBeInTheDocument()
  })

  it('renders Notify Me button', () => {
    render(<ReservePage />)
    expect(screen.getByRole('button', { name: /notify me/i })).toBeInTheDocument()
  })
})
```

**Step 2: Run test — expect failure**

```bash
npx jest __tests__/app/reserve.test.tsx --no-coverage
```

Expected: FAIL — module not found.

**Step 3: Create `app/reserve/page.tsx`**

```tsx
'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/Button'

export default function ReservePage() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitted(true)
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-navy-900 px-6 text-center">
      <Image
        src="/logos/transparent_background_logo.png"
        alt="NAVO Marine Technologies"
        width={140}
        height={38}
        className="mb-12"
      />

      <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
        Reserve Vakaros Atlas II Units
      </h1>

      <p className="mt-4 text-lg text-white/50">
        Reservation system launching soon.
      </p>

      {submitted ? (
        <p className="mt-10 text-marine-400">
          You're on the list. We'll be in touch.
        </p>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="mt-10 flex w-full max-w-sm flex-col gap-3 sm:flex-row"
        >
          <label htmlFor="notify-email" className="sr-only">Email</label>
          <input
            id="notify-email"
            type="email"
            required
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 rounded-full border border-white/15 bg-white/5 px-5 py-3 text-sm text-white placeholder:text-white/30 backdrop-blur focus:outline-none focus:ring-2 focus:ring-marine-500"
          />
          <Button variant="primary" type="submit">
            Notify Me
          </Button>
        </form>
      )}
    </main>
  )
}
```

**Step 4: Run test — expect pass**

```bash
npx jest __tests__/app/reserve.test.tsx --no-coverage
```

Expected: PASS (4 tests).

**Step 5: Commit**

```bash
git add app/reserve/page.tsx __tests__/app/reserve.test.tsx
git commit -m "feat: add /reserve Coming Soon page with email capture"
```

---

## Task 11: Create /login placeholder page

No test needed — pure placeholder, no behaviour to verify.

**Files:**
- Create: `app/login/page.tsx`

**Step 1: Create `app/login/page.tsx`**

```tsx
import Image from 'next/image'

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-navy-900 px-6 text-center">
      <Image
        src="/logos/transparent_background_logo.png"
        alt="NAVO Marine Technologies"
        width={140}
        height={38}
        className="mb-12"
      />
      <h1 className="text-3xl font-semibold text-white">Login</h1>
      <p className="mt-4 text-white/40">Authentication coming soon.</p>
    </main>
  )
}
```

**Step 2: Commit**

```bash
git add app/login/page.tsx
git commit -m "feat: add /login placeholder page"
```

---

## Task 12: Full test suite + coverage check

**Step 1: Run all tests**

```bash
npx jest --no-coverage
```

Expected: All tests pass. If any fail, fix the specific test before continuing.

**Step 2: Run with coverage**

```bash
npx jest --coverage
```

Expected: Lines ≥ 80%. If below, identify uncovered lines and add targeted tests.

**Step 3: Smoke test in browser**

```bash
npm run dev
```

Visit and verify:
- `http://localhost:3000` — Hero + AuthorityStrip + VakarosSection only
- `http://localhost:3000/capabilities` — CoreCapabilities + DataCapabilities (video plays)
- `http://localhost:3000/contact` — ContactSection
- `http://localhost:3000/reserve` — Coming Soon + email form
- `http://localhost:3000/login` — Placeholder
- All buttons show liquid glass effect (blur + specular highlight)
- Navbar: Capabilities, Contact, Reserve links + Login button — no "Partner With NAVO"

**Step 4: Final commit if anything was tweaked**

```bash
git add -p
git commit -m "fix: post-integration tweaks from smoke test"
```

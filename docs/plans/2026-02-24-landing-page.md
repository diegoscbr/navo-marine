# NAVO Marine Technologies — Landing Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a high-performance, dark-mode marketing landing page for NAVO Marine Technologies using Next.js, showcasing partnership credentials, core capabilities, and a contact inquiry form.

**Architecture:** Next.js 15 App Router with Tailwind CSS for styling, Framer Motion for subtle animations, and a server-side API route for contact form submission. Sections are isolated React components assembled in `app/page.tsx`.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS v3, Framer Motion, React Testing Library + Jest, Playwright (E2E)

---

## Project File Map

```
navo-marine/
├── app/
│   ├── layout.tsx                # Root layout: fonts, meta, global wrapper
│   ├── page.tsx                  # Page assembly (imports all section components)
│   ├── globals.css               # Tailwind directives + base styles
│   └── api/
│       └── inquiry/
│           └── route.ts          # POST handler for contact form
├── components/
│   ├── layout/
│   │   ├── Navbar.tsx
│   │   └── Footer.tsx
│   ├── sections/
│   │   ├── Hero.tsx
│   │   ├── AuthorityStrip.tsx
│   │   ├── CoreCapabilities.tsx
│   │   ├── DataCapabilities.tsx
│   │   ├── VakarosSection.tsx
│   │   ├── RaceManagement.tsx
│   │   ├── WhyNavo.tsx
│   │   └── ClosingCTA.tsx
│   └── ui/
│       ├── Button.tsx
│       ├── SectionHeader.tsx
│       └── InquiryForm.tsx
├── lib/
│   └── analytics.ts              # GA4 event helpers
├── __tests__/
│   ├── components/               # Component unit tests
│   └── api/                      # API route tests
├── e2e/
│   └── inquiry-flow.spec.ts      # Playwright E2E
├── public/
│   └── logos/                    # Logo PNGs (copy from brandGuides/)
├── tailwind.config.ts
├── jest.config.ts
├── jest.setup.ts
├── next.config.ts
└── package.json
```

---

## Phase 1: Project Setup

### Task 1: Initialize Next.js project with dependencies

**Files:**
- Create: `package.json`, `next.config.ts`, `tailwind.config.ts`, `tsconfig.json`

**Step 1: Run project initializer**

```bash
cd /Users/diegoescobar/Documents/navo-marine
npx create-next-app@latest . \
  --typescript \
  --tailwind \
  --app \
  --src-dir=false \
  --import-alias="@/*" \
  --no-git
```

When prompted, accept all defaults. Say "Yes" to Tailwind, "Yes" to App Router.

**Step 2: Install additional dependencies**

```bash
npm install framer-motion
npm install --save-dev \
  jest \
  jest-environment-jsdom \
  @testing-library/react \
  @testing-library/jest-dom \
  @testing-library/user-event \
  @types/jest \
  @playwright/test
```

**Step 3: Verify it compiles**

```bash
npm run build
```

Expected: `✓ Compiled successfully`

**Step 4: Commit**

```bash
git add package.json package-lock.json next.config.ts tailwind.config.ts tsconfig.json app/ public/
git commit -m "chore: initialize Next.js 15 project with Tailwind and Framer Motion"
```

---

### Task 2: Configure Jest and Tailwind brand tokens

**Files:**
- Create: `jest.config.ts`
- Create: `jest.setup.ts`
- Modify: `tailwind.config.ts`

**Step 1: Write failing test to prove Jest is wired up**

Create `__tests__/setup.test.ts`:

```typescript
describe('Jest setup', () => {
  it('runs tests', () => {
    expect(true).toBe(true)
  })
})
```

**Step 2: Run test — expect it to fail (Jest not configured yet)**

```bash
npx jest
```

Expected: `jest: command not found` or configuration error.

**Step 3: Create jest.config.ts**

```typescript
import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterFramework: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    'framer-motion': '<rootDir>/__mocks__/framer-motion.tsx',
  },
  collectCoverageFrom: [
    'components/**/*.{ts,tsx}',
    'app/api/**/*.ts',
    'lib/**/*.ts',
    '!**/*.d.ts',
  ],
  coverageThreshold: {
    global: { lines: 80 },
  },
}

export default createJestConfig(config)
```

**Step 4: Create jest.setup.ts**

```typescript
import '@testing-library/jest-dom'
```

**Step 5: Create Framer Motion mock at `__mocks__/framer-motion.tsx`**

```typescript
import React from 'react'

const motion = new Proxy({}, {
  get: (_target, prop: string) => {
    const Component = React.forwardRef(
      ({ children, ...props }: React.HTMLAttributes<HTMLElement>, ref: React.Ref<HTMLElement>) =>
        React.createElement(prop, { ...props, ref }, children)
    )
    Component.displayName = prop
    return Component
  },
})

export { motion }
export const AnimatePresence = ({ children }: { children: React.ReactNode }) => <>{children}</>
export const useAnimation = () => ({ start: jest.fn() })
export const useInView = () => [null, true]
```

**Step 6: Update tailwind.config.ts with brand tokens**

```typescript
import type { Config } from 'tailwindcss'

export default {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#0B1F2A',
          800: '#0F2C3F',
          700: '#1A3A50',
        },
        marine: {
          500: '#1E6EFF',
          400: '#4D8FFF',
          300: '#7AADFF',
        },
        cyan: {
          glow: '#00D4FF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
```

**Step 7: Run test to verify it passes**

```bash
npm run test
```

Expected: `PASS __tests__/setup.test.ts`

**Step 8: Commit**

```bash
git add jest.config.ts jest.setup.ts tailwind.config.ts __mocks__/ __tests__/setup.test.ts
git commit -m "chore: configure Jest with RTL, Framer Motion mock, and Tailwind brand tokens"
```

---

### Task 3: Root layout with fonts, metadata, and global styles

**Files:**
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

**Step 1: Write failing test**

Create `__tests__/components/layout.test.tsx`:

```typescript
import { render } from '@testing-library/react'
import RootLayout from '@/app/layout'

describe('RootLayout', () => {
  it('renders children', () => {
    const { getByText } = render(
      <RootLayout>
        <p>test child</p>
      </RootLayout>
    )
    expect(getByText('test child')).toBeInTheDocument()
  })
})
```

**Step 2: Run test — verify it fails**

```bash
npm test -- --testPathPattern="layout.test"
```

Expected: FAIL — import error.

**Step 3: Implement app/layout.tsx**

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'NAVO Marine Technologies | Precision Marine Performance',
  description:
    'Official Vakaros Atlas II Partner. Race management, performance analytics, and advanced marine data systems for high-performance sailing.',
  keywords: ['sailing', 'race management', 'marine analytics', 'Vakaros Atlas II', 'performance sailing'],
  openGraph: {
    title: 'NAVO Marine Technologies',
    description: 'Technology That Moves Sailing Forward.',
    type: 'website',
    url: 'https://navomarine.com',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-navy-900 text-white antialiased">{children}</body>
    </html>
  )
}
```

**Step 4: Update app/globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --font-inter: '';
  }

  html {
    scroll-behavior: smooth;
  }

  body {
    @apply bg-[#0B1F2A] text-white;
  }

  ::selection {
    @apply bg-marine-500 text-white;
  }
}

@layer utilities {
  .text-gradient {
    @apply bg-gradient-to-r from-marine-300 to-cyan-glow bg-clip-text text-transparent;
  }
}
```

**Step 5: Run test to verify it passes**

```bash
npm test -- --testPathPattern="layout.test"
```

Expected: PASS

**Step 6: Commit**

```bash
git add app/layout.tsx app/globals.css __tests__/components/layout.test.tsx
git commit -m "feat: root layout with Inter font, brand metadata, and global styles"
```

---

## Phase 2: UI Primitives

### Task 4: Button component

**Files:**
- Create: `components/ui/Button.tsx`
- Create: `__tests__/components/ui/Button.test.tsx`

**Step 1: Write failing test**

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '@/components/ui/Button'

describe('Button', () => {
  it('renders primary variant', () => {
    render(<Button variant="primary">Partner With NAVO</Button>)
    expect(screen.getByRole('button', { name: 'Partner With NAVO' })).toBeInTheDocument()
  })

  it('renders outline variant', () => {
    render(<Button variant="outline">Learn More</Button>)
    const btn = screen.getByRole('button', { name: 'Learn More' })
    expect(btn).toHaveClass('border')
  })

  it('calls onClick handler', async () => {
    const user = userEvent.setup()
    const onClick = jest.fn()
    render(<Button variant="primary" onClick={onClick}>Click</Button>)
    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders as anchor when href is provided', () => {
    render(<Button variant="primary" href="#contact">CTA</Button>)
    expect(screen.getByRole('link', { name: 'CTA' })).toHaveAttribute('href', '#contact')
  })
})
```

**Step 2: Run test — verify it fails**

```bash
npm test -- --testPathPattern="Button.test"
```

Expected: FAIL — module not found.

**Step 3: Implement components/ui/Button.tsx**

```typescript
import { forwardRef } from 'react'

type Variant = 'primary' | 'outline'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant: Variant
  href?: string
  children: React.ReactNode
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-marine-500 text-white hover:bg-marine-400 focus-visible:outline-marine-500',
  outline:
    'border border-marine-500 text-marine-400 hover:bg-marine-500 hover:text-white focus-visible:outline-marine-500',
}

const base =
  'inline-flex items-center justify-center rounded-md px-6 py-3 text-sm font-medium tracking-wide transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50'

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, href, children, className = '', ...props }, ref) => {
    const classes = `${base} ${variantClasses[variant]} ${className}`

    if (href) {
      return (
        <a href={href} className={classes}>
          {children}
        </a>
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

**Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="Button.test"
```

Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add components/ui/Button.tsx __tests__/components/ui/Button.test.tsx
git commit -m "feat: Button component with primary/outline variants and href support"
```

---

### Task 5: SectionHeader component

**Files:**
- Create: `components/ui/SectionHeader.tsx`
- Create: `__tests__/components/ui/SectionHeader.test.tsx`

**Step 1: Write failing test**

```typescript
import { render, screen } from '@testing-library/react'
import { SectionHeader } from '@/components/ui/SectionHeader'

describe('SectionHeader', () => {
  it('renders heading text', () => {
    render(<SectionHeader heading="Built for High-Performance Sailing." />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Built for High-Performance Sailing.'
    )
  })

  it('renders optional subheading', () => {
    render(
      <SectionHeader
        heading="Why NAVO"
        subheading="Performance-first methodology"
      />
    )
    expect(screen.getByText('Performance-first methodology')).toBeInTheDocument()
  })

  it('does not render subheading element when not provided', () => {
    render(<SectionHeader heading="Title" />)
    expect(screen.queryByTestId('subheading')).not.toBeInTheDocument()
  })
})
```

**Step 2: Run test — verify it fails**

```bash
npm test -- --testPathPattern="SectionHeader.test"
```

Expected: FAIL

**Step 3: Implement components/ui/SectionHeader.tsx**

```typescript
interface SectionHeaderProps {
  heading: string
  subheading?: string
  centered?: boolean
}

export function SectionHeader({ heading, subheading, centered = true }: SectionHeaderProps) {
  return (
    <div className={`mb-16 ${centered ? 'text-center' : ''}`}>
      <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-5xl">
        {heading}
      </h2>
      {subheading && (
        <p
          data-testid="subheading"
          className="mt-4 text-lg text-white/60"
        >
          {subheading}
        </p>
      )}
    </div>
  )
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="SectionHeader.test"
```

Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add components/ui/SectionHeader.tsx __tests__/components/ui/SectionHeader.test.tsx
git commit -m "feat: SectionHeader component with optional subheading"
```

---

## Phase 3: Layout Components

### Task 6: Navbar

**Files:**
- Create: `components/layout/Navbar.tsx`
- Create: `__tests__/components/layout/Navbar.test.tsx`

**Step 1: Write failing test**

```typescript
import { render, screen } from '@testing-library/react'
import { Navbar } from '@/components/layout/Navbar'

describe('Navbar', () => {
  it('renders NAVO brand name', () => {
    render(<Navbar />)
    expect(screen.getByText('NAVO')).toBeInTheDocument()
  })

  it('renders navigation links', () => {
    render(<Navbar />)
    expect(screen.getByRole('link', { name: /capabilities/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /race management/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /contact/i })).toBeInTheDocument()
  })

  it('renders CTA button', () => {
    render(<Navbar />)
    expect(screen.getByRole('link', { name: /partner with navo/i })).toBeInTheDocument()
  })
})
```

**Step 2: Run test — verify it fails**

```bash
npm test -- --testPathPattern="Navbar.test"
```

Expected: FAIL

**Step 3: Implement components/layout/Navbar.tsx**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'

const navLinks = [
  { label: 'Capabilities', href: '#capabilities' },
  { label: 'Race Management', href: '#race-management' },
  { label: 'Data Systems', href: '#data' },
  { label: 'Vakaros Atlas II', href: '#vakaros' },
  { label: 'Contact', href: '#contact' },
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
        <a href="#" className="text-xl font-bold tracking-widest text-white">
          NAVO
        </a>

        <ul className="hidden items-center gap-8 md:flex">
          {navLinks.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-sm text-white/70 transition-colors hover:text-white"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <Button variant="primary" href="#contact">
          Partner With NAVO
        </Button>
      </nav>
    </header>
  )
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="Navbar.test"
```

Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add components/layout/Navbar.tsx __tests__/components/layout/Navbar.test.tsx
git commit -m "feat: Navbar with scroll-aware background, nav links, and CTA"
```

---

### Task 7: Footer

**Files:**
- Create: `components/layout/Footer.tsx`
- Create: `__tests__/components/layout/Footer.test.tsx`

**Step 1: Write failing test**

```typescript
import { render, screen } from '@testing-library/react'
import { Footer } from '@/components/layout/Footer'

describe('Footer', () => {
  it('renders brand name', () => {
    render(<Footer />)
    expect(screen.getByText('NAVO Marine Technologies')).toBeInTheDocument()
  })

  it('renders tagline', () => {
    render(<Footer />)
    expect(screen.getByText(/technology that moves sailing forward/i)).toBeInTheDocument()
  })

  it('renders copyright with current year', () => {
    render(<Footer />)
    const year = new Date().getFullYear()
    expect(screen.getByText(new RegExp(String(year)))).toBeInTheDocument()
  })
})
```

**Step 2: Run test — verify it fails**

```bash
npm test -- --testPathPattern="Footer.test"
```

Expected: FAIL

**Step 3: Implement components/layout/Footer.tsx**

```typescript
export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-white/10 bg-navy-900 py-12">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-lg font-semibold tracking-widest text-white">
            NAVO Marine Technologies
          </p>
          <p className="text-sm text-white/40">
            Technology That Moves Sailing Forward.
          </p>
          <p className="text-xs text-white/30">
            © {year} NAVO Marine Technologies. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="Footer.test"
```

Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add components/layout/Footer.tsx __tests__/components/layout/Footer.test.tsx
git commit -m "feat: Footer with brand name, tagline, and dynamic copyright year"
```

---

## Phase 4: Landing Page Sections

### Task 8: Hero section

**Files:**
- Create: `components/sections/Hero.tsx`
- Create: `__tests__/components/sections/Hero.test.tsx`

**Step 1: Write failing test**

```typescript
import { render, screen } from '@testing-library/react'
import { Hero } from '@/components/sections/Hero'

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
})
```

**Step 2: Run test — verify it fails**

```bash
npm test -- --testPathPattern="Hero.test"
```

Expected: FAIL

**Step 3: Implement components/sections/Hero.tsx**

```typescript
'use client'

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/Button'

export function Hero() {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-b from-navy-800 to-navy-900">
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
          Technology That Moves
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

**Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="Hero.test"
```

Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add components/sections/Hero.tsx __tests__/components/sections/Hero.test.tsx
git commit -m "feat: Hero section with animated headline, grid overlay, and dual CTAs"
```

---

### Task 9: Authority Strip

**Files:**
- Create: `components/sections/AuthorityStrip.tsx`
- Create: `__tests__/components/sections/AuthorityStrip.test.tsx`

**Step 1: Write failing test**

```typescript
import { render, screen } from '@testing-library/react'
import { AuthorityStrip } from '@/components/sections/AuthorityStrip'

describe('AuthorityStrip', () => {
  it('renders Vakaros partnership credential', () => {
    render(<AuthorityStrip />)
    expect(screen.getByText(/vakaros atlas ii/i)).toBeInTheDocument()
  })

  it('renders UR SAILING partnership credential', () => {
    render(<AuthorityStrip />)
    expect(screen.getByText(/ur sailing/i)).toBeInTheDocument()
  })

  it('renders all 3 trust signals', () => {
    render(<AuthorityStrip />)
    const items = screen.getAllByRole('listitem')
    expect(items.length).toBeGreaterThanOrEqual(3)
  })
})
```

**Step 2: Run test — verify it fails**

```bash
npm test -- --testPathPattern="AuthorityStrip.test"
```

Expected: FAIL

**Step 3: Implement components/sections/AuthorityStrip.tsx**

```typescript
const trustSignals = [
  { label: 'Official Brand Partner', name: 'Vakaros Atlas II' },
  { label: 'Premier Partner', name: 'UR SAILING' },
  { label: 'Powered by', name: 'Advanced Marine Analytics' },
]

export function AuthorityStrip() {
  return (
    <section className="border-y border-white/10 bg-navy-800/50 py-8">
      <div className="mx-auto max-w-7xl px-6">
        <ul className="flex flex-col items-center justify-center gap-8 sm:flex-row sm:gap-16">
          {trustSignals.map((signal) => (
            <li key={signal.name} className="flex flex-col items-center gap-1 text-center">
              <span className="text-xs font-medium uppercase tracking-widest text-white/40">
                {signal.label}
              </span>
              <span className="text-sm font-semibold text-white/80">{signal.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="AuthorityStrip.test"
```

Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add components/sections/AuthorityStrip.tsx __tests__/components/sections/AuthorityStrip.test.tsx
git commit -m "feat: AuthorityStrip with Vakaros and UR SAILING partnership credentials"
```

---

### Task 10: Core Capabilities section

**Files:**
- Create: `components/sections/CoreCapabilities.tsx`
- Create: `__tests__/components/sections/CoreCapabilities.test.tsx`

**Step 1: Write failing test**

```typescript
import { render, screen } from '@testing-library/react'
import { CoreCapabilities } from '@/components/sections/CoreCapabilities'

describe('CoreCapabilities', () => {
  it('renders section heading', () => {
    render(<CoreCapabilities />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Built for High-Performance Sailing.'
    )
  })

  it('renders all 3 capability cards', () => {
    render(<CoreCapabilities />)
    expect(screen.getByText('Performance Technology')).toBeInTheDocument()
    expect(screen.getByText('Race Management Services')).toBeInTheDocument()
    expect(screen.getByText('Marine Data Intelligence')).toBeInTheDocument()
  })

  it('renders capability descriptions', () => {
    render(<CoreCapabilities />)
    expect(screen.getByText(/vakaros atlas ii/i)).toBeInTheDocument()
    expect(screen.getByText(/end-to-end regatta/i)).toBeInTheDocument()
    expect(screen.getByText(/post-race analytics/i)).toBeInTheDocument()
  })
})
```

**Step 2: Run test — verify it fails**

```bash
npm test -- --testPathPattern="CoreCapabilities.test"
```

Expected: FAIL

**Step 3: Implement components/sections/CoreCapabilities.tsx**

```typescript
'use client'

import { motion } from 'framer-motion'
import { SectionHeader } from '@/components/ui/SectionHeader'

const capabilities = [
  {
    title: 'Performance Technology',
    description:
      'Official Vakaros Atlas II integration. Onboard systems optimization, instrumentation configuration, and athlete-level calibration.',
    items: ['Atlas II Integration', 'Systems Optimization', 'Instrumentation Config', 'Athlete Calibration'],
  },
  {
    title: 'Race Management Services',
    description:
      'End-to-end regatta execution. Live tracking, course analytics, data-enabled officiating, and fleet coordination systems.',
    items: ['Live Fleet Tracking', 'Course Analytics', 'Data-Enabled Officiating', 'Fleet Coordination'],
  },
  {
    title: 'Marine Data Intelligence',
    description:
      'Post-race analytics, performance modeling, and tactical breakdown with environmental condition integration.',
    items: ['Post-Race Analytics', 'Performance Modeling', 'Tactical Breakdown', 'Custom Dashboards'],
  },
]

export function CoreCapabilities() {
  return (
    <section id="capabilities" className="py-24 bg-navy-900">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader heading="Built for High-Performance Sailing." />

        <div className="grid gap-8 md:grid-cols-3">
          {capabilities.map((cap, i) => (
            <motion.div
              key={cap.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="rounded-xl border border-white/10 bg-navy-800/60 p-8"
            >
              <h3 className="mb-4 text-lg font-semibold text-white">{cap.title}</h3>
              <p className="mb-6 text-sm leading-relaxed text-white/60">{cap.description}</p>
              <ul className="space-y-2">
                {cap.items.map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm text-white/70">
                    <span className="h-1 w-4 rounded-full bg-marine-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="CoreCapabilities.test"
```

Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add components/sections/CoreCapabilities.tsx __tests__/components/sections/CoreCapabilities.test.tsx
git commit -m "feat: CoreCapabilities section with 3-column capability cards"
```

---

### Task 11: Data Capabilities section

**Files:**
- Create: `components/sections/DataCapabilities.tsx`
- Create: `__tests__/components/sections/DataCapabilities.test.tsx`

**Step 1: Write failing test**

```typescript
import { render, screen } from '@testing-library/react'
import { DataCapabilities } from '@/components/sections/DataCapabilities'

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
})
```

**Step 2: Run test — verify it fails**

```bash
npm test -- --testPathPattern="DataCapabilities.test"
```

Expected: FAIL

**Step 3: Implement components/sections/DataCapabilities.tsx**

```typescript
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
              <Button variant="outline" href="#contact">
                Explore Data Capabilities
              </Button>
            </div>
          </div>

          {/* Animated dashboard mockup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="rounded-xl border border-white/10 bg-navy-900 p-6 font-mono text-xs"
            aria-hidden="true"
          >
            <div className="mb-4 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-red-500/60" />
              <span className="h-3 w-3 rounded-full bg-yellow-500/60" />
              <span className="h-3 w-3 rounded-full bg-green-500/60" />
              <span className="ml-4 text-white/30">navo-telemetry-dashboard</span>
            </div>
            <div className="space-y-2 text-white/70">
              <p><span className="text-marine-400">fleet</span>.getBoat(<span className="text-cyan-glow">'NAVO-01'</span>)</p>
              <p className="pl-4 text-white/40">→ lat: 37.8044, lng: -122.4194</p>
              <p className="pl-4 text-white/40">→ sog: 12.4kn, cog: 247°</p>
              <p className="pl-4 text-white/40">→ twa: 68°, tws: 18.2kn</p>
              <p className="mt-4"><span className="text-marine-400">race</span>.getLeaderboard()</p>
              <div className="pl-4 text-white/40 space-y-1">
                <p>1. NAVO-01 — 12.4kn — +0:00</p>
                <p>2. NAVO-07 — 11.9kn — +0:12</p>
                <p>3. NAVO-03 — 11.8kn — +0:19</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="DataCapabilities.test"
```

Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add components/sections/DataCapabilities.tsx __tests__/components/sections/DataCapabilities.test.tsx
git commit -m "feat: DataCapabilities section with numbered list and terminal-style dashboard mockup"
```

---

### Task 12: Vakaros Atlas II section

**Files:**
- Create: `components/sections/VakarosSection.tsx`
- Create: `__tests__/components/sections/VakarosSection.test.tsx`

**Step 1: Write failing test**

```typescript
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

  it('renders CTA link', () => {
    render(<VakarosSection />)
    expect(screen.getByRole('link', { name: /atlas ii integration/i })).toBeInTheDocument()
  })
})
```

**Step 2: Run test — verify it fails**

```bash
npm test -- --testPathPattern="VakarosSection.test"
```

Expected: FAIL

**Step 3: Implement components/sections/VakarosSection.tsx**

```typescript
'use client'

import { motion } from 'framer-motion'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Button } from '@/components/ui/Button'

const services = [
  'Certified Integration',
  'Calibration Services',
  'Deployment Strategy',
  'Team Training',
  'System Optimization',
]

export function VakarosSection() {
  return (
    <section id="vakaros" className="py-24 bg-navy-900">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-16 lg:grid-cols-2 lg:items-center">
          {/* Visual block */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative overflow-hidden rounded-2xl border border-white/10 bg-black aspect-video flex items-center justify-center"
          >
            <div className="text-center">
              <p className="text-xs uppercase tracking-widest text-white/30">Vakaros</p>
              <p className="mt-2 text-4xl font-bold tracking-tight text-white">Atlas II</p>
              <p className="mt-1 text-xs text-marine-400 tracking-widest">OFFICIAL PARTNER</p>
            </div>
            {/* Technical callout lines */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute left-8 top-1/4 h-px w-16 bg-marine-500/40" />
              <div className="absolute right-8 bottom-1/3 h-px w-12 bg-marine-500/30" />
              <div className="absolute left-6 bottom-8 h-8 w-px bg-marine-500/20" />
            </div>
          </motion.div>

          {/* Content */}
          <div>
            <SectionHeader
              heading="Official Vakaros Atlas II Partner."
              centered={false}
            />
            <ul className="grid grid-cols-2 gap-4">
              {services.map((service, i) => (
                <motion.li
                  key={service}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="flex items-center gap-3 text-sm text-white/70"
                >
                  <span className="h-px w-6 bg-marine-500" />
                  {service}
                </motion.li>
              ))}
            </ul>
            <div className="mt-10">
              <Button variant="primary" href="#contact">
                Learn About Atlas II Integration
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="VakarosSection.test"
```

Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add components/sections/VakarosSection.tsx __tests__/components/sections/VakarosSection.test.tsx
git commit -m "feat: VakarosSection with official partner callout and service grid"
```

---

### Task 13: Race Management section

**Files:**
- Create: `components/sections/RaceManagement.tsx`
- Create: `__tests__/components/sections/RaceManagement.test.tsx`

**Step 1: Write failing test**

```typescript
import { render, screen } from '@testing-library/react'
import { RaceManagement } from '@/components/sections/RaceManagement'

describe('RaceManagement', () => {
  it('renders section heading', () => {
    render(<RaceManagement />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Elite Race Execution.'
    )
  })

  it('renders all 5 capabilities', () => {
    render(<RaceManagement />)
    expect(screen.getByText(/event architecture/i)).toBeInTheDocument()
    expect(screen.getByText(/on-water technology/i)).toBeInTheDocument()
    expect(screen.getByText(/fleet tracking/i)).toBeInTheDocument()
    expect(screen.getByText(/compliance/i)).toBeInTheDocument()
    expect(screen.getByText(/spectator/i)).toBeInTheDocument()
  })
})
```

**Step 2: Run test — verify it fails**

```bash
npm test -- --testPathPattern="RaceManagement.test"
```

Expected: FAIL

**Step 3: Implement components/sections/RaceManagement.tsx**

```typescript
'use client'

import { motion } from 'framer-motion'
import { SectionHeader } from '@/components/ui/SectionHeader'

const capabilities = [
  {
    title: 'Event Architecture',
    description: 'Full regatta design — from course setting to schedule management.',
  },
  {
    title: 'On-Water Technology Systems',
    description: 'Integrated instrumentation, radio, and timing infrastructure.',
  },
  {
    title: 'Fleet Tracking',
    description: 'Real-time GPS fleet positioning for officials and spectators.',
  },
  {
    title: 'Compliance Systems',
    description: 'Protest management, finishing systems, and rules enforcement tools.',
  },
  {
    title: 'Live Spectator Data Feeds',
    description: 'Public-facing dashboards and broadcast-ready data pipelines.',
  },
]

export function RaceManagement() {
  return (
    <section id="race-management" className="py-24 bg-navy-800/40">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader
          heading="Elite Race Execution."
          subheading="Operational excellence meets marine innovation."
        />

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {capabilities.map((cap, i) => (
            <motion.div
              key={cap.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="rounded-lg border border-white/10 bg-navy-900/80 p-6"
            >
              <h3 className="mb-2 font-semibold text-white">{cap.title}</h3>
              <p className="text-sm leading-relaxed text-white/50">{cap.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="RaceManagement.test"
```

Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add components/sections/RaceManagement.tsx __tests__/components/sections/RaceManagement.test.tsx
git commit -m "feat: RaceManagement section with 5-capability card grid"
```

---

### Task 14: Why NAVO section

**Files:**
- Create: `components/sections/WhyNavo.tsx`
- Create: `__tests__/components/sections/WhyNavo.test.tsx`

**Step 1: Write failing test**

```typescript
import { render, screen } from '@testing-library/react'
import { WhyNavo } from '@/components/sections/WhyNavo'

describe('WhyNavo', () => {
  it('renders section heading', () => {
    render(<WhyNavo />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'Why Leading Teams Choose NAVO.'
    )
  })

  it('renders all differentiator points', () => {
    render(<WhyNavo />)
    expect(screen.getByText(/performance-first/i)).toBeInTheDocument()
    expect(screen.getByText(/hardware.*analytics/i)).toBeInTheDocument()
    expect(screen.getByText(/international/i)).toBeInTheDocument()
    expect(screen.getByText(/technical precision/i)).toBeInTheDocument()
    expect(screen.getByText(/trusted.*elite/i)).toBeInTheDocument()
  })
})
```

**Step 2: Run test — verify it fails**

```bash
npm test -- --testPathPattern="WhyNavo.test"
```

Expected: FAIL

**Step 3: Implement components/sections/WhyNavo.tsx**

```typescript
'use client'

import { motion } from 'framer-motion'
import { SectionHeader } from '@/components/ui/SectionHeader'

const differentiators = [
  {
    title: 'Performance-First Methodology',
    description: 'Every decision is evaluated against one metric: does it make the boat faster?',
  },
  {
    title: 'Integrated Hardware & Analytics Ecosystem',
    description: 'NAVO connects instrumentation, data pipelines, and race operations into a single system.',
  },
  {
    title: 'International Credibility',
    description: 'Partnerships with Vakaros and UR SAILING place NAVO at the center of global racing.',
  },
  {
    title: 'Technical Precision',
    description: 'We operate at the intersection of engineering and competitive sailing.',
  },
  {
    title: 'Trusted by Elite Programs',
    description: 'Our systems are deployed at the highest levels of the sport.',
  },
]

export function WhyNavo() {
  return (
    <section className="py-24 bg-navy-900">
      <div className="mx-auto max-w-7xl px-6">
        <SectionHeader heading="Why Leading Teams Choose NAVO." />

        <div className="mx-auto max-w-3xl space-y-6">
          {differentiators.map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, x: -16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.07 }}
              className="flex gap-6 border-b border-white/8 pb-6 last:border-0"
            >
              <span className="mt-1 text-xs font-bold text-marine-500">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="font-semibold text-white">{item.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-white/50">{item.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="WhyNavo.test"
```

Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add components/sections/WhyNavo.tsx __tests__/components/sections/WhyNavo.test.tsx
git commit -m "feat: WhyNavo section with numbered differentiator list"
```

---

### Task 15: Closing CTA section

**Files:**
- Create: `components/sections/ClosingCTA.tsx`
- Create: `__tests__/components/sections/ClosingCTA.test.tsx`

**Step 1: Write failing test**

```typescript
import { render, screen } from '@testing-library/react'
import { ClosingCTA } from '@/components/sections/ClosingCTA'

describe('ClosingCTA', () => {
  it('renders closing statement', () => {
    render(<ClosingCTA />)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'The Future of Marine Performance Starts Here.'
    )
  })

  it('renders Partner CTA', () => {
    render(<ClosingCTA />)
    expect(screen.getByRole('link', { name: /partner with navo/i })).toBeInTheDocument()
  })

  it('renders Request Consultation CTA', () => {
    render(<ClosingCTA />)
    expect(screen.getByRole('link', { name: /request consultation/i })).toBeInTheDocument()
  })
})
```

**Step 2: Run test — verify it fails**

```bash
npm test -- --testPathPattern="ClosingCTA.test"
```

Expected: FAIL

**Step 3: Implement components/sections/ClosingCTA.tsx**

```typescript
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
          The Future of Marine Performance
          <br />
          <span className="text-gradient">Starts Here.</span>
        </h2>

        <div className="mt-12 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Button variant="primary" href="#contact">
            Partner With NAVO
          </Button>
          <Button variant="outline" href="#contact">
            Request Consultation
          </Button>
        </div>
      </motion.div>
    </section>
  )
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="ClosingCTA.test"
```

Expected: PASS (3 tests)

**Step 5: Commit**

```bash
git add components/sections/ClosingCTA.tsx __tests__/components/sections/ClosingCTA.test.tsx
git commit -m "feat: ClosingCTA section with large typography and dual action buttons"
```

---

## Phase 5: Contact Form & API

### Task 16: InquiryForm component

**Files:**
- Create: `components/ui/InquiryForm.tsx`
- Create: `__tests__/components/ui/InquiryForm.test.tsx`

**Step 1: Write failing test**

```typescript
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InquiryForm } from '@/components/ui/InquiryForm'

global.fetch = jest.fn()

describe('InquiryForm', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders all required form fields', () => {
    render(<InquiryForm />)
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/organization/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/message/i)).toBeInTheDocument()
  })

  it('shows validation errors when submitted empty', async () => {
    const user = userEvent.setup()
    render(<InquiryForm />)
    await user.click(screen.getByRole('button', { name: /send/i }))
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument()
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument()
  })

  it('submits form with valid data and shows success', async () => {
    const user = userEvent.setup()
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    })

    render(<InquiryForm />)
    await user.type(screen.getByLabelText(/name/i), 'Diego Escobar')
    await user.type(screen.getByLabelText(/email/i), 'diego@example.com')
    await user.type(screen.getByLabelText(/organization/i), 'Team NAVO')
    await user.type(screen.getByLabelText(/message/i), 'Interested in race management services.')
    await user.click(screen.getByRole('button', { name: /send/i }))

    await waitFor(() => {
      expect(screen.getByText(/inquiry received/i)).toBeInTheDocument()
    })
  })

  it('shows error message on API failure', async () => {
    const user = userEvent.setup()
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false })

    render(<InquiryForm />)
    await user.type(screen.getByLabelText(/name/i), 'Diego')
    await user.type(screen.getByLabelText(/email/i), 'diego@example.com')
    await user.type(screen.getByLabelText(/message/i), 'Hello')
    await user.click(screen.getByRole('button', { name: /send/i }))

    await waitFor(() => {
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
    })
  })
})
```

**Step 2: Run test — verify it fails**

```bash
npm test -- --testPathPattern="InquiryForm.test"
```

Expected: FAIL

**Step 3: Implement components/ui/InquiryForm.tsx**

```typescript
'use client'

import { useState } from 'react'
import { Button } from './Button'

interface FormData {
  name: string
  email: string
  organization: string
  message: string
}

interface FormErrors {
  name?: string
  email?: string
  message?: string
}

const initialData: FormData = { name: '', email: '', organization: '', message: '' }

function validate(data: FormData): FormErrors {
  const errors: FormErrors = {}
  if (!data.name.trim()) errors.name = 'Name is required.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.email = 'Please enter a valid email.'
  if (!data.message.trim()) errors.message = 'Message is required.'
  return errors
}

export function InquiryForm() {
  const [form, setForm] = useState<FormData>(initialData)
  const [errors, setErrors] = useState<FormErrors>({})
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
    setErrors((prev) => ({ ...prev, [e.target.name]: undefined }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const validationErrors = validate(form)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }
    setStatus('loading')
    try {
      const res = await fetch('/api/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('API error')
      setStatus('success')
      setForm(initialData)
    } catch {
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="rounded-xl border border-marine-500/30 bg-marine-500/10 p-8 text-center">
        <p className="text-lg font-semibold text-white">Inquiry Received.</p>
        <p className="mt-2 text-sm text-white/60">We'll be in touch shortly.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {status === 'error' && (
        <p className="rounded-md bg-red-500/10 px-4 py-3 text-sm text-red-400">
          Something went wrong. Please try again.
        </p>
      )}

      {([
        { id: 'name', label: 'Name', type: 'text' },
        { id: 'email', label: 'Email', type: 'email' },
        { id: 'organization', label: 'Organization', type: 'text' },
      ] as const).map((field) => (
        <div key={field.id}>
          <label htmlFor={field.id} className="block text-sm font-medium text-white/80">
            {field.label}
          </label>
          <input
            id={field.id}
            name={field.id}
            type={field.type}
            value={form[field.id]}
            onChange={handleChange}
            className="mt-2 w-full rounded-md border border-white/10 bg-navy-800 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-marine-500 focus:outline-none"
          />
          {errors[field.id as keyof FormErrors] && (
            <p className="mt-1 text-xs text-red-400">{errors[field.id as keyof FormErrors]}</p>
          )}
        </div>
      ))}

      <div>
        <label htmlFor="message" className="block text-sm font-medium text-white/80">
          Message
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          value={form.message}
          onChange={handleChange}
          className="mt-2 w-full rounded-md border border-white/10 bg-navy-800 px-4 py-3 text-sm text-white placeholder-white/30 focus:border-marine-500 focus:outline-none"
        />
        {errors.message && <p className="mt-1 text-xs text-red-400">{errors.message}</p>}
      </div>

      <Button variant="primary" type="submit" disabled={status === 'loading'}>
        {status === 'loading' ? 'Sending…' : 'Send Inquiry'}
      </Button>
    </form>
  )
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="InquiryForm.test"
```

Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add components/ui/InquiryForm.tsx __tests__/components/ui/InquiryForm.test.tsx
git commit -m "feat: InquiryForm with validation, success/error states, and fetch integration"
```

---

### Task 17: Contact section + API route

**Files:**
- Create: `app/api/inquiry/route.ts`
- Create: `__tests__/api/inquiry.test.ts`

**Step 1: Write failing test for the API route**

```typescript
import { POST } from '@/app/api/inquiry/route'
import { NextRequest } from 'next/server'

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/inquiry', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('POST /api/inquiry', () => {
  it('returns 200 with valid payload', async () => {
    const req = makeRequest({
      name: 'Diego Escobar',
      email: 'diego@example.com',
      organization: 'Team NAVO',
      message: 'Interested in services.',
    })
    const res = await POST(req)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
  })

  it('returns 400 when name is missing', async () => {
    const req = makeRequest({ email: 'test@example.com', message: 'Hello' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when email is invalid', async () => {
    const req = makeRequest({ name: 'Test', email: 'not-an-email', message: 'Hello' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 400 when message is missing', async () => {
    const req = makeRequest({ name: 'Test', email: 'test@example.com' })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })
})
```

**Step 2: Run test — verify it fails**

```bash
npm test -- --testPathPattern="inquiry.test"
```

Expected: FAIL

**Step 3: Implement app/api/inquiry/route.ts**

```typescript
import { NextRequest, NextResponse } from 'next/server'

interface InquiryPayload {
  name: string
  email: string
  organization?: string
  message: string
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function validate(body: Partial<InquiryPayload>): string | null {
  if (!body.name?.trim()) return 'Name is required.'
  if (!body.email || !isValidEmail(body.email)) return 'Valid email is required.'
  if (!body.message?.trim()) return 'Message is required.'
  return null
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Partial<InquiryPayload>

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const error = validate(body)
  if (error) {
    return NextResponse.json({ error }, { status: 400 })
  }

  // TODO: Integrate with CRM or email service (e.g. Resend)
  console.log('[inquiry]', {
    name: body.name,
    email: body.email,
    organization: body.organization ?? '',
    message: body.message,
    timestamp: new Date().toISOString(),
  })

  return NextResponse.json({ success: true })
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="inquiry.test"
```

Expected: PASS (4 tests)

**Step 5: Commit**

```bash
git add app/api/inquiry/route.ts __tests__/api/inquiry.test.ts
git commit -m "feat: inquiry API route with input validation and structured logging"
```

---

## Phase 6: Page Assembly & SEO

### Task 18: Assemble app/page.tsx + contact section

**Files:**
- Modify: `app/page.tsx`

**Step 1: Write failing test**

```typescript
import { render, screen } from '@testing-library/react'
import Page from '@/app/page'

describe('Landing page', () => {
  it('renders all major sections', () => {
    render(<Page />)
    expect(screen.getByRole('heading', { name: /technology that moves/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /built for high-performance/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /elite race execution/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /official vakaros/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /future of marine/i })).toBeInTheDocument()
  })

  it('renders contact form', () => {
    render(<Page />)
    expect(screen.getByRole('heading', { name: /get in touch/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
  })
})
```

**Step 2: Run test — verify it fails**

```bash
npm test -- --testPathPattern="page.test"
```

Expected: FAIL

**Step 3: Implement app/page.tsx**

```typescript
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { Hero } from '@/components/sections/Hero'
import { AuthorityStrip } from '@/components/sections/AuthorityStrip'
import { CoreCapabilities } from '@/components/sections/CoreCapabilities'
import { DataCapabilities } from '@/components/sections/DataCapabilities'
import { VakarosSection } from '@/components/sections/VakarosSection'
import { RaceManagement } from '@/components/sections/RaceManagement'
import { WhyNavo } from '@/components/sections/WhyNavo'
import { ClosingCTA } from '@/components/sections/ClosingCTA'
import { InquiryForm } from '@/components/ui/InquiryForm'

export default function Page() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <AuthorityStrip />
        <CoreCapabilities />
        <DataCapabilities />
        <VakarosSection />
        <RaceManagement />
        <WhyNavo />
        <ClosingCTA />

        <section id="contact" className="py-24 bg-navy-800/40">
          <div className="mx-auto max-w-2xl px-6">
            <h2 className="mb-4 text-3xl font-semibold text-white">Get in Touch.</h2>
            <p className="mb-10 text-white/60">
              Ready to elevate your race program? Reach out to discuss partnership or consultation.
            </p>
            <InquiryForm />
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}
```

**Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="page.test"
```

Expected: PASS (2 tests)

**Step 5: Run full test suite to confirm coverage**

```bash
npm test -- --coverage
```

Expected: Coverage > 80%, all tests PASS.

**Step 6: Commit**

```bash
git add app/page.tsx __tests__/components/page.test.tsx
git commit -m "feat: assemble full landing page with all sections and contact form"
```

---

### Task 19: Copy logo assets + public setup

**Files:**
- Copy: `brandGuides/NAVO_LOGO/*.png` → `public/logos/`

**Step 1: Copy logo files**

```bash
mkdir -p public/logos
cp brandGuides/NAVO_LOGO/black_background_logo.png public/logos/
cp brandGuides/NAVO_LOGO/transparent_background_logo.png public/logos/
```

**Step 2: Update Navbar to use the logo image**

In `components/layout/Navbar.tsx`, replace the `NAVO` text with:

```typescript
import Image from 'next/image'

// Replace the anchor content:
<a href="#" className="flex items-center">
  <Image
    src="/logos/transparent_background_logo.png"
    alt="NAVO Marine Technologies"
    width={120}
    height={32}
    priority
  />
</a>
```

**Step 3: Verify build still passes**

```bash
npm run build
```

Expected: `✓ Compiled successfully`

**Step 4: Commit**

```bash
git add public/logos/ components/layout/Navbar.tsx
git commit -m "feat: add logo assets and use Next.js Image in Navbar"
```

---

## Phase 7: E2E Tests

### Task 20: E2E — contact form critical path

**Files:**
- Create: `e2e/inquiry-flow.spec.ts`
- Create: `playwright.config.ts`

**Step 1: Create playwright.config.ts**

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

**Step 2: Write failing E2E test**

Create `e2e/inquiry-flow.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

test.describe('Landing page inquiry flow', () => {
  test('page loads and hero is visible', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /technology that moves/i })).toBeVisible()
  })

  test('inquiry form submits and shows success', async ({ page }) => {
    await page.goto('/#contact')

    await page.getByLabel('Name').fill('Diego Escobar')
    await page.getByLabel('Email').fill('diego@test.com')
    await page.getByLabel('Organization').fill('Team NAVO')
    await page.getByLabel('Message').fill('Interested in race management services.')

    // Intercept API call to avoid real network in E2E
    await page.route('/api/inquiry', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ success: true }) })
    )

    await page.getByRole('button', { name: /send inquiry/i }).click()
    await expect(page.getByText(/inquiry received/i)).toBeVisible()
  })

  test('form shows validation errors when submitted empty', async ({ page }) => {
    await page.goto('/#contact')
    await page.getByRole('button', { name: /send inquiry/i }).click()
    await expect(page.getByText(/name is required/i)).toBeVisible()
    await expect(page.getByText(/valid email/i)).toBeVisible()
  })

  test('all sections are visible on scroll', async ({ page }) => {
    await page.goto('/')
    const sections = [
      /built for high-performance/i,
      /advanced data infrastructure/i,
      /official vakaros atlas ii/i,
      /elite race execution/i,
      /why leading teams/i,
      /future of marine/i,
    ]
    for (const heading of sections) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible()
    }
  })
})
```

**Step 3: Install Playwright browsers**

```bash
npx playwright install chromium
```

**Step 4: Start dev server and run E2E tests**

```bash
npm run dev &
sleep 3
npx playwright test
```

Expected: All 4 tests PASS.

**Step 5: Commit**

```bash
git add e2e/ playwright.config.ts
git commit -m "test: E2E tests for landing page load and inquiry form flow"
```

---

## Phase 8: Final Verification

### Task 21: Run full suite and build check

**Step 1: Run all unit tests with coverage**

```bash
npm test -- --coverage
```

Expected: All tests PASS, coverage ≥ 80%.

**Step 2: Production build**

```bash
npm run build
```

Expected: `✓ Compiled successfully`, no TypeScript errors.

**Step 3: Verify dev server looks correct**

```bash
npm run dev
```

Open `http://localhost:3000` and visually verify:
- [ ] Dark background loads immediately
- [ ] Hero headline visible above fold
- [ ] Navbar fixed on scroll
- [ ] All 8 sections render
- [ ] Contact form works
- [ ] Responsive on mobile (resize window to 375px)

**Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final verification pass — all tests green, build clean"
```

---

## Summary

| Phase | Tasks | Key Output |
|-------|-------|-----------|
| Setup | 1–2 | Next.js + Tailwind + Jest configured |
| UI Primitives | 3–5 | Button, SectionHeader, layout |
| Sections | 6–15 | 8 landing page sections |
| Forms & API | 16–17 | InquiryForm + validated API route |
| Assembly | 18–19 | Full page, logo integration |
| E2E | 20 | Playwright critical path tests |
| Final | 21 | Coverage ≥ 80%, clean build |
